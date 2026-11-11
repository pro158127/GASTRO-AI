import io
import base64
import time
import logging
import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models import efficientnet_b1
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# 1. Inicialización de FastAPI y CORS
app = FastAPI(
    title="Gastro-AI Inference API",
    description="API de diagnóstico endoscópico y explicabilidad Grad-CAM",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gastroai")

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# 2. Arquitectura EfficientNet-B1
class GastroAI_EfficientNetB1(nn.Module):
    def __init__(self, num_classes=4):
        super(GastroAI_EfficientNetB1, self).__init__()
        self.backbone = efficientnet_b1(weights=None)
        in_features = self.backbone.classifier.in_features
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.3, inplace=True),
            nn.Linear(in_features, num_classes)
        )

    def forward(self, x):
        return self.backbone(x)

# Cargar Modelo con Pesos de Pérdida Enmascarada (Época 07)
model = GastroAI_EfficientNetB1(num_classes=4).to(device)
WEIGHTS_PATH = "best_gastroai_masked_loss.pth"

try:
    model.load_state_dict(torch.load(WEIGHTS_PATH, map_location=device))
    model.eval()
    logger.info("Pesos de Gastro-AI cargados correctamente en Hugging Face Space.")
except Exception as e:
    logger.error("Error al cargar los pesos: %s", e)

# Umbrales Óptimos Calibrados en las Matrices de Confusión
OPTIMAL_THRESHOLDS = np.array([0.335, 0.499, 0.946, 0.982])
CLASS_NAMES = ['normal_mucosa', 'erythematous_gastritis', 'gastric_atrophy', 'h_pylori_signs']
CLASS_LABELS_ES = ['Mucosa Normal', 'Gastritis Eritematosa', 'Atrofia Gástrica', 'Signos H. Pylori']

val_transform = transforms.Compose([
    transforms.Resize((240, 240)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# 3. Explicabilidad Grad-CAM
class GradCAM:
    def __init__(self, model, target_layer):
        self.model = model
        self.target_layer = target_layer
        self.gradients = None
        self.activations = None
        self.target_layer.register_forward_hook(self._save_activation)
        self.target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0]

    def generate_heatmap(self, input_tensor, class_idx):
        self.model.eval()
        self.model.zero_grad()
        output = self.model(input_tensor)
        score = output[0, class_idx]
        score.backward(retain_graph=True)

        gradients = self.gradients.data.cpu().numpy()
        activations = self.activations.data.cpu().numpy()
        weights = np.mean(gradients, axis=(1, 2))
        cam = np.zeros(activations.shape[1:], dtype=np.float32)
        for i, w in enumerate(weights):
            cam += w * activations[i, :, :]
        cam = np.maximum(cam, 0)
        if np.max(cam) > 0:
            cam = cam / np.max(cam)
        probabilities = torch.sigmoid(output).detach().cpu().numpy()
        return cam, probabilities

gradcam = GradCAM(model, model.backbone.features[-1])

def ndarray_to_base64(img_np):
    img_pil = Image.fromarray(img_np)
    buffer = io.BytesIO()
    img_pil.save(buffer, format="JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def check_image_quality(img_np):
    """Control de calidad automático (RF-P01).

    Rechaza imágenes demasiado oscuras o desenfocadas antes de la inferencia.
    Devuelve (ok, motivo). `ok == False` implica rechazo.
    """
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    brightness = float(gray.mean())
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    if brightness < 40.0:
        return False, f"imagen demasiado oscura (brillo medio {brightness:.1f})"
    if laplacian_var < 50.0:
        return False, f"imagen desenfocada (varianza de Laplaciano {laplacian_var:.1f})"
    return True, f"brillo {brightness:.1f}, varianza Laplaciano {laplacian_var:.1f}"

# 4. Endpoints de la API
@app.get("/")
def health_check():
    return {
        "status": "online",
        "service": "Gastro-AI Inference API",
        "model": "EfficientNet-B1 (Masked Loss - Época 07)"
    }

@app.post("/api/v1/analyze")
async def analyze_endoscopy(file: UploadFile = File(...)):
    start_time = time.time()
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen válida.")

    contents = await file.read()
    raw_pil = Image.open(io.BytesIO(contents)).convert('RGB')
    raw_resized = raw_pil.resize((240, 240))
    img_np = np.array(raw_resized)

    ok, qc_reason = check_image_quality(img_np)
    if not ok:
        logger.warning("QC rechazó la imagen '%s': %s", file.filename, qc_reason)
        raise HTTPException(status_code=422, detail=f"Control de calidad no superado: {qc_reason}")

    input_tensor = val_transform(raw_pil).unsqueeze(0).to(device)

    diagnostics = {}
    gradcam_b64 = {}

    for class_idx in range(4):
        c_name = CLASS_NAMES[class_idx]
        c_label = CLASS_LABELS_ES[class_idx]
        thresh = float(OPTIMAL_THRESHOLDS[class_idx])

        cam, probs = gradcam.generate_heatmap(input_tensor, class_idx)
        prob_pct = float(probs[0, class_idx])
        detected = bool(prob_pct >= thresh)

        heatmap = cv2.resize(cam, (240, 240))
        heatmap_color = cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)
        overlay = cv2.addWeighted(img_np, 0.6, heatmap_color, 0.4, 0)

        diagnostics[c_name] = {
            "label_es": c_label,
            "probability": round(prob_pct, 4),
            "percentage": round(prob_pct * 100, 2),
            "threshold": thresh,
            "detected": detected
        }
        gradcam_b64[c_name] = ndarray_to_base64(overlay)

    probs_log = {k: v["percentage"] for k, v in diagnostics.items()}
    elapsed_ms = (time.time() - start_time) * 1000
    logger.info(
        "Inferencia '%s' (%s) en %.1f ms | probs=%s",
        file.filename, qc_reason, elapsed_ms, probs_log,
    )

    return {
        "filename": file.filename,
        "diagnostics": diagnostics,
        "gradcam_visualizations_b64": gradcam_b64
    }
