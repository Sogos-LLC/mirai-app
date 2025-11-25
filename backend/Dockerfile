# ============================================================
# 1. Build stage
# ============================================================
FROM golang:1.22-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# ============================================================
# 2. Final minimal image (non-root safe)
# ============================================================
FROM alpine:3.20

# Create application directory
WORKDIR /app

# Copy binary from builder
COPY --from=builder /src/server /app/server

# Copy migrations
COPY --from=builder /src/internal/database/migrations /app/migrations

# Ensure the binary is executable for all users
RUN chmod 755 /app/server

# Create non-root user with UID 10000
RUN adduser -D -u 10000 appuser

# Use non-root user
USER 10000

# Read-only root filesystem friendly
ENTRYPOINT ["./server"]
