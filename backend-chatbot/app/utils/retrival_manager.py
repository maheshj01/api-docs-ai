
from typing import Dict, Any
from app.core.logger import setup_logger
from retrieval_service.app.core.enums import DocSource
from retrieval_service.app.retrieval.base import RetrievalPipeline

class PipelineManager:
    _instance = None
    _pipelines: Dict[str, Any] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PipelineManager, cls).__new__(cls)
            cls._instance.logger = setup_logger(__name__)
        return cls._instance

    def initialize_pipeline(self, source: DocSource):
        """Initialize pipeline for a specific doc source if not already initialized"""
        if source.value not in self._pipelines:
            try:
                pipeline = RetrievalPipeline()
                pipeline.load_source(source)
                self._pipelines[source.value] = pipeline
                self.logger.info(f"Successfully initialized pipeline for {source.value}")
            except Exception as e:
                self.logger.error(f"Error initializing pipeline for {source.value}: {e}")
                raise

    def get_pipeline(self, source: DocSource) -> Any:
        """Get pipeline for a specific doc source"""
        if source.value not in self._pipelines:
            self.initialize_pipeline(source)
        return self._pipelines[source.value]

    def search_documents(self, source: DocSource, query: str):
        """Search documents using the appropriate pipeline"""
        try:
            pipeline = self.get_pipeline(source)
            # RetrievalPipeline (and its embedders) are singletons, so only one
            # source's chunks/embeddings are live at a time. Make the requested
            # source active before searching, otherwise a query for one source
            # would be answered from whichever source was loaded last.
            if pipeline.current_source != source:
                self.logger.info(
                    f"Switching active source to {source.value} "
                    f"(was {getattr(pipeline.current_source, 'value', None)})"
                )
                pipeline.load_source(source)
            return pipeline.search_documents(query)
        except Exception as e:
            self.logger.error(f"Error searching documents: {e}")
            raise