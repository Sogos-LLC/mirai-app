#!/bin/bash

# Build Docker image
docker build -t mirai-frontend:latest .

echo "Docker image built successfully: mirai-frontend:latest"
echo ""
echo "To run locally:"
echo "  docker run -p 3000:3000 mirai-frontend:latest"
echo ""
echo "To load into k3s/Talos:"
echo "  docker save mirai-frontend:latest | sudo k3s ctr images import -"
