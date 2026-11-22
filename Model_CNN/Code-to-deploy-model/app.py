"""Gastro-AI inference API intended for a private Hugging Face Docker Space.

The API returns multi-label predictions for gastritis, atrophy, and H. pylori.
It is an experimental research tool, not a medical device.
"""

import base64
import hashlib
import hmac
import io
import os
import re
import sys
import threading
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from fastapi import Depends, FastAPI, File, HTTPException, Security, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from PIL import Image, UnidentifiedImageError
from torchvision import transforms
from torchvision.models import efficientnet_b1


# =============================================================================
# Configuration and artifact integrity
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent
WEIGHTS_PATH = Path(
    os.getenv(
        "GASTROAI_WEIGHTS_PATH",
        str(BASE_DIR / "best_gastroai_efficientnet_b1_3cat_fold2_v8.pth"),
    )
).resolve()
DEFAULT_WEIGHTS_SHA256 = "9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4"
EXPECTED_SHA256 = os.getenv("HF_SHA256", DEFAULT_WEIGHTS_SHA256).strip().lower()
REVISION_SHA = os.getenv("GASTROAI_REVISION_SHA", "").strip().lower() or None
API_KEY_NAME = "X-API-Key"
EXPECTED_API_KEY = os.getenv("GASTROAI_API_KEY", "").strip()
SPACE_ID = os.getenv("SPACE_ID", "").strip()
MAX_IMAGE_BYTES = int(os.getenv("GASTROAI_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))
SUPPORTED_IMAGE_FORMATS = {"JPEG", "PNG", "BMP"}
CLASS_MAPPING = {
    0: {"name": "GASTRITIS", "threshold": 0.50},
    1: {"name": "ATROFIA", "threshold": 0.50},
    2: {"name": "HPYLORI", "threshold": 0.50},
}
EXPECTED_CLASS_ORDER = ["GASTRITIS", "ATROFIA", "HPYLORI"]
EXPECTED_FOLD = 2


def _fail_startup(message: str) -> None:
    sys.stderr.write(f"\n[GASTRO-AI CONFIGURATION ERROR] {message}\n\n")
    raise SystemExit(1)


if not re.fullmatch(r"[0-9a-f]{64}", EXPECTED_SHA256):
    _fail_startup("HF_SHA256 must be the 64-character SHA-256 of the model weights.")
if REVISION_SHA and not re.fullmatch(r"[0-9a-f]{40}", REVISION_SHA):
    _fail_startup("GASTROAI_REVISION_SHA must be the 40-character Hugging Face commit SHA.")
if SPACE_ID and not EXPECTED_API_KEY:
    _fail_startup("Set GASTROAI_API_KEY as a Space secret before starting the public Space.")
if SPACE_ID and not REVISION_SHA:
    _fail_startup("Set GASTROAI_REVISION_SHA to the published Space commit SHA before serving requests.")
if MAX_IMAGE_BYTES < 1:
    _fail_startup("GASTROAI_MAX_IMAGE_BYTES must be a positive integer.")


def verify_file_integrity(file_path: Path, expected_hash: str) -> str:
    """Verify and return the SHA-256 of the bundled model checkpoint."""
    if not file_path.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {file_path.name}")

    digest = hashlib.sha256()
    with file_path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)

    actual_hash = digest.hexdigest()
    if not hmac.compare_digest(actual_hash, expected_hash):
        raise ValueError(
            "Model checkpoint SHA-256 mismatch. "
            f"Actual: {actual_hash}; expected: {expected_hash}"
        )
    return actual_hash


try:
    CHECKPOINT_SHA256 = verify_file_integrity(WEIGHTS_PATH, EXPECTED_SHA256)
except Exception as exc:  # fail before the server starts if the artifact is invalid
    _fail_startup(str(exc))

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# =============================================================================
# Model and preprocessing
# =============================================================================
model = efficientnet_b1(weights=None)
model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(EXPECTED_CLASS_ORDER))
model = model.to(DEVICE)
try:
    # The pinned checkpoint stores training metadata alongside tensors; the SHA-256
    # was verified above before loading this project-owned artifact.
    checkpoint = torch.load(WEIGHTS_PATH, map_location=DEVICE, weights_only=False)
    if checkpoint.get("class_order") != EXPECTED_CLASS_ORDER:
        raise ValueError(
            "Checkpoint class_order mismatch: "
            f"expected {EXPECTED_CLASS_ORDER}, got {checkpoint.get('class_order')}"
        )
    if int(checkpoint.get("fold", -1)) != EXPECTED_FOLD:
        raise ValueError(
            f"Expected fold {EXPECTED_FOLD}, got fold {checkpoint.get('fold')}"
        )
    state_dict = checkpoint.get("model_state_dict")
    if not isinstance(state_dict, dict):
        raise ValueError("Checkpoint is missing its model_state_dict.")
    model.load_state_dict(state_dict)
    model.eval()
except Exception as exc:
    _fail_startup(f"Could not load the verified fold-2 checkpoint: {exc}")

val_transform = transforms.Compose(
    [
        transforms.Resize((240, 240)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
        ),
    ]
)


# =============================================================================
# Grad-CAM and ROI
# =============================================================================
class GradCAM:
    def __init__(self, target_model: nn.Module, target_layer: nn.Module):
        self.model = target_model
        self.gradients = None
        self.activations = None
        self._forward_handle = target_layer.register_forward_hook(self._save_activation)
        self._backward_handle = target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, _module, _inputs, output):
        self.activations = output

    def _save_gradient(self, _module, _grad_input, grad_output):
        self.gradients = grad_output[0]

    def generate_heatmap(self, input_tensor: torch.Tensor, class_index: int):
        self.model.eval()
        self.model.zero_grad(set_to_none=True)
        logits = self.model(input_tensor)
        logits[0, class_index].backward()

        gradients = self.gradients.detach().cpu().numpy()[0]
        activations = self.activations.detach().cpu().numpy()[0]
        weights = gradients.mean(axis=(1, 2))
        cam = np.maximum((weights[:, None, None] * activations).sum(axis=0), 0)
        if float(cam.max()) > 0:
            cam = cam / cam.max()
        probabilities = torch.sigmoid(logits.detach()).cpu().numpy()
        return cam, probabilities


gradcam = GradCAM(model, model.features[-1])
INFERENCE_LOCK = threading.Lock()  # Grad-CAM hooks hold per-request mutable state.


def extract_roi_box_and_png(cam: np.ndarray, threshold: float = 0.5):
    cam_resized = cv2.resize(cam, (240, 240))
    binary_mask = (cam_resized >= threshold).astype(np.uint8) * 255
    contours, _ = cv2.findContours(
        binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    if contours:
        x, y, box_width, box_height = cv2.boundingRect(
            max(contours, key=cv2.contourArea)
        )
        area_pct = round((box_width * box_height) / (240 * 240) * 100, 2)
        roi = {
            "x": int(x),
            "y": int(y),
            "ancho": int(box_width),
            "alto": int(box_height),
            "area_pct": area_pct,
        }
    else:
        roi = {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0}

    heatmap = cv2.applyColorMap(np.uint8(255 * cam_resized), cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    buffer = io.BytesIO()
    Image.fromarray(heatmap).save(buffer, format="PNG")
    heatmap_png_b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
    return roi, heatmap_png_b64


# =============================================================================
# FastAPI endpoints
# =============================================================================
app = FastAPI(
    title="Gastro-AI Inference API",
    version="1.2.0",
    description=(
        "Experimental multi-label endoscopy image analysis. "
        "Not a medical device and not for clinical decision-making."
    ),
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("GASTROAI_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["X-API-Key", "Content-Type"],
    )

api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def verify_api_key(api_key: str | None = Security(api_key_header)) -> str:
    if not EXPECTED_API_KEY:
        raise HTTPException(status_code=503, detail="Inference API is not configured.")
    if not api_key or not hmac.compare_digest(api_key, EXPECTED_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
    return api_key


@app.get("/")
@app.get("/health")
def status_check():
    return {
        "status": "ready",
        "revision_sha": REVISION_SHA,
        "checkpoint_sha256": CHECKPOINT_SHA256,
        "classes": [entry["name"] for entry in CLASS_MAPPING.values()],
    }


@app.post("/clasificar", dependencies=[Depends(verify_api_key)])
def clasificar_imagen(imagen: UploadFile = File(...)):
    contents = imagen.file.read(MAX_IMAGE_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the upload size limit.")

    try:
        with Image.open(io.BytesIO(contents)) as check_image:
            detected_format = check_image.format
            check_image.verify()
        if detected_format not in SUPPORTED_IMAGE_FORMATS:
            raise HTTPException(
                status_code=415,
                detail="Unsupported image format. Use JPEG, PNG, or BMP; DICOM is not supported.",
            )
        with Image.open(io.BytesIO(contents)) as image_file:
            raw_image = image_file.convert("RGB")
    except HTTPException:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ):
        raise HTTPException(status_code=400, detail="Invalid or unreadable image.") from None

    input_tensor = val_transform(raw_image).unsqueeze(0).to(DEVICE)
    predictions = {}
    with INFERENCE_LOCK:
        for class_index, info in CLASS_MAPPING.items():
            cam, probabilities = gradcam.generate_heatmap(input_tensor, class_index)
            probability = float(probabilities[0, class_index])
            roi, heatmap_png = extract_roi_box_and_png(cam, threshold=0.5)
            predictions[info["name"]] = {
                "probabilidad": round(probability, 6),
                "umbral": info["threshold"],
                "detectado": bool(probability >= info["threshold"]),
                "region_roi": roi,
                "mapa_calor_png_b64": heatmap_png,
            }

    return {
        "revision_sha": REVISION_SHA,
        "checkpoint_sha256": CHECKPOINT_SHA256,
        "predicciones": predictions,
    }
