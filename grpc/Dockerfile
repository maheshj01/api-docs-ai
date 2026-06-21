# Use the official Python image from Docker Hub
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    gcc \
    g++ \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip, setuptools, wheel
RUN pip install --upgrade pip setuptools wheel

# Copy the requirements file
COPY requirements.txt .

# Install torch first (CPU version)
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other dependencies
RUN pip install --no-cache-dir -r requirements.txt || pip install --no-cache-dir -r requirements.txt

# Install gRPC and protobuf explicitly
RUN pip install --no-cache-dir grpcio grpcio-tools protobuf

# Copy the entire project
COPY . .

# Create __init__.py files to make directories proper Python packages
RUN touch grpc_server/__init__.py && \
    touch grpc_server/grpc_files/__init__.py && \
    touch grpc_server/core/__init__.py && \
    touch grpc_server/utils/__init__.py && \
    touch grpc_server/agents/__init__.py

# Install the retrieval_service package
RUN cd grpc_server/retrieval_service && pip install -e . || true

# Set PYTHONPATH to include the grpc_server directory
ENV PYTHONPATH="/app:/app/grpc_server"

# Expose gRPC server port
EXPOSE 50051  

# Start the gRPC server
CMD ["python", "-m", "grpc_server.server"]