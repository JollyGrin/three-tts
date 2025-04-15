FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY server/go.mod server/go.sum ./

# Download all dependencies
RUN go mod download

# Copy source code
COPY server/ ./

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Start a new stage from scratch
FROM alpine:latest

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/main .

# Command to run the executable
CMD ["./main"]
