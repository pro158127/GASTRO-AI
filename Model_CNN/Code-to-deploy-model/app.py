import io
import os
import sys
import base64
import hashlib
import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models import efficientnet_b1
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Security
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware

# ==============================================================================
# 1. CONFIGURACIÓN Y CONTROLES DE SEGURIDAD (RNF-30 & RF-A01)
# ==============================================================================
EXPECTED_SHA256 = os.getenv(
    "HF_SHA256",
    "d4b264bf0a954cad5b2c26f834ec8a02eb07eeac41eed14b6e65e4f46b41fc76"
)
WEIGHTS_PATH = "best_gastroai_masked_loss.pth"
REVISION_SHA = os.getenv("GASTROAI_REVISION_SHA", "v1.0.0-masked-loss-ep07")
API_KEY_NAME = "X-API-Key"
EXPECTED_API_KEY = os.getenv("GASTROAI_API_KEY")

api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def verify_file_integrity(file_path: str, expected_hash: str):
    """Verifica la huella SHA-256 del archivo de pesos antes de cargar."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"❌ CRÍTICO: No existe el archivo de pesos: {file_path}")

    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)

    calculated_hash = sha256_hash.hexdigest().lower()
    if calculated_hash != expected_hash.lower():
        raise ValueError(
            f"❌ CRÍTICO: Huella SHA-256 no coincide.\nCalculada: {calculated_hash}\nEsperada:   {expected_hash}"
        )

# FAIL-FAST: El servidor SE NIEGA A ARRANCAR si no existen los pesos válidos
try:
    verify_file_integrity(WEIGHTS_PATH, EXPECTED_SHA256)
except Exception as e:
    sys.stderr.write(f"\n[GASTRO-AI ERROR INICIALIZACIÓN] {e}\n\n")
    sys.exit(1) # Aborta la ejecución de Uvicorn/Docker inmediatamente

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ==============================================================================
# 2. ARQUITECTURA Y CARGA OBLIGATORIA DEL MODELO
# ==============================================================================
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

model = GastroAI_EfficientNetB1(num_classes=4).to(device)

try:
    model.load_state_dict(torch.load(WEIGHTS_PATH, map_location=device))
    model.eval()
except Exception as e:
    sys.stderr.write(f"❌ CRÍTICO: Fallo al cargar state_dict: {e}\n")
    sys.exit(1)

# Umbrales acotados estrictamente entre el 10% y el 90% según RF-A01
CLASS_MAPPING = {
    1: {"name": "GASTRITIS", "threshold": 0.499},  # 49.9%
    2: {"name": "ATROFIA",   "threshold": 0.900},  # Acotado a 90.0% por RF-A01
    3: {"name": "HPYLORI",   "threshold": 0.900}   # Acotado a 90.0% por RF-A01
}

val_transform = transforms.Compose([
    transforms.Resize((240, 240)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# ==============================================================================
# 3. EXPLICABILIDAD GRAD-CAM Y EXTRACCIÓN DE ROI
# ==============================================================================
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

        gradients = self.gradients.data.cpu().numpy()       # [1, C, H, W]
        activations = self.activations.data.cpu().numpy()   # [1, C, H, W]
        weights = np.mean(gradients[0], axis=(1, 2))        # [C]
        cam = np.zeros(activations.shape[2:], dtype=np.float32)  # [H, W]
        for i, w in enumerate(weights):
            cam += w * activations[0, i, :, :]
        cam = np.maximum(cam, 0)
        if np.max(cam) > 0:
            cam = cam / np.max(cam)
        probabilities = torch.sigmoid(output).detach().cpu().numpy()
        return cam, probabilities

gradcam = GradCAM(model, model.backbone.features[-1])

def extract_roi_box_and_png(cam, threshold=0.5):
    cam_resized = cv2.resize(cam, (240, 240))

    # Extraer bounding box ROI
    binary_mask = (cam_resized >= threshold).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if contours:
        largest_contour = max(contours, key=cv2.contourArea)
        x, y, box_w, box_h = cv2.boundingRect(largest_contour)
        area_pct = round(((box_w * box_h) / (240 * 240)) * 100, 2)
        roi_data = {"x": int(x), "y": int(y), "ancho": int(box_w), "alto": int(box_h), "area_pct": area_pct}
    else:
        roi_data = {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0}

    # Generar imagen aislada del mapa de calor en formato PNG Base64
    heatmap_color = cv2.applyColorMap(np.uint8(255 * cam_resized), cv2.COLORMAP_JET)
    heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)

    img_pil = Image.fromarray(heatmap_color)
    buffer = io.BytesIO()
    img_pil.save(buffer, format="PNG")
    heatmap_png_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return roi_data, heatmap_png_b64

# ==============================================================================
# 4. FASTAPI APP & ENDPOINTS (CERO LOGGING / PRIVACIDAD RNF-30)
# ==============================================================================
app = FastAPI(title="Gastro-AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def verify_api_key(api_key: str = Security(api_key_header)):
    if EXPECTED_API_KEY and api_key != EXPECTED_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Acceso Denegado: API Key inválida o no proporcionada."
        )
    return api_key

@app.get("/")
def status_check():
    return {"status": "ready", "revision_sha": REVISION_SHA}

@app.post("/clasificar", dependencies=[Depends(verify_api_key)])
async def clasificar_imagen(imagen: UploadFile = File(...)):
    contents = await imagen.read()
    try:
        raw_pil = Image.open(io.BytesIO(contents)).convert('RGB')
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen inválida.")

    input_tensor = val_transform(raw_pil).unsqueeze(0).to(device)
    resultados_clases = {}

    # Procesar únicamente las 3 patologías de RF-M01
    for class_idx, info in CLASS_MAPPING.items():
        c_name = info["name"]
        thresh = info["threshold"]

        cam, probs = gradcam.generate_heatmap(input_tensor, class_idx)
        prob_val = float(probs[0, class_idx])

        roi_box, heatmap_png = extract_roi_box_and_png(cam, threshold=0.5)

        resultados_clases[c_name] = {
            "probabilidad": round(prob_val, 4),
            "detectado": bool(prob_val >= thresh),
            "region_roi": roi_box,
            "mapa_calor_png_b64": heatmap_png
        }

    # RNF-30: Cero impresión de logs de archivos o predicciones
    return {
        "revision_sha": REVISION_SHA,
        "predicciones": resultados_clases
    }
