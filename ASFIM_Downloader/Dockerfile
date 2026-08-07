FROM python:3.10
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
# Hugging Face utilise toujours le port 7860, on force l'API à utiliser ce port
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "7860"]