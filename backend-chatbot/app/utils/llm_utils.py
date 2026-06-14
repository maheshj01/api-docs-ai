# app/utils/llm_utils.py
import os
from typing import Optional
from langchain.llms import Ollama
from langchain.embeddings import OllamaEmbeddings
from app.core.logger import setup_logger

logger = setup_logger(__name__)

# langchain's Ollama defaults to http://localhost:11434, which inside a
# container points at the container itself. Use OLLAMA_HOST (set in compose)
# so the backend reaches the Ollama instance on the host.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

def get_llm(model_name: Optional[str] = None):
    """Initializes and returns an LLM instance with fallback handling."""
    from app.core.models import ModelsManager, ModelProvider, ModelResponse
    
    model_response = ModelsManager.get_model_config(model_name)
    model_config = model_response.data

    if model_config.provider == ModelProvider.OLLAMA:
        llm = Ollama(model=model_config.name, base_url=OLLAMA_BASE_URL, **model_config.parameters)
        return ModelResponse(
            data=llm,
            is_fallback=model_response.is_fallback,
            message=model_response.message
        )

    raise ValueError(f"Unsupported model provider: {model_config.provider}")

def get_embeddings(model_name: Optional[str] = None):
    """Gets embeddings model based on the specified model."""
    from app.core.models import ModelsManager, ModelProvider, ModelResponse
    
    model_response = ModelsManager.get_model_config(model_name)
    model_config = model_response.data

    if model_config.provider == ModelProvider.OLLAMA:
        embeddings = OllamaEmbeddings(model=model_config.name, base_url=OLLAMA_BASE_URL)
        return ModelResponse(
            data=embeddings,
            is_fallback=model_response.is_fallback,
            message=model_response.message
        )

    raise ValueError(f"Unsupported model provider: {model_config.provider}")