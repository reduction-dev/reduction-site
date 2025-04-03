FROM alpine:3.18
WORKDIR /app
RUN apk --no-cache add ca-certificates curl
COPY ./deploy-go /app/deploy-go
RUN chmod +x /app/deploy-go
ENTRYPOINT ["/app/deploy-go"]
CMD ["start"]
