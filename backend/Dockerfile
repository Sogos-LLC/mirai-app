# ============================================================
# 1. Build stage
# ============================================================
FROM golang:1.24-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build static binaries
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o migrate ./cmd/migrate

# ============================================================
# 2. Final minimal image (non-root safe)
# ============================================================
FROM alpine:3.20

# Create application directory
WORKDIR /app

# Copy binaries from builder
COPY --from=builder /src/server /app/server
COPY --from=builder /src/migrate /app/migrate

# Copy migrations directory
COPY --from=builder /src/migrations /app/migrations

# Ensure binaries are executable for all users
RUN chmod 755 /app/server /app/migrate

# Create non-root user with UID 10000
RUN adduser -D -u 10000 appuser

# Use non-root user
USER 10000

# Read-only root filesystem friendly
ENTRYPOINT ["./server"]
