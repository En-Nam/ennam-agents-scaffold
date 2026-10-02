from fastapi import FastAPI

# Throwaway app for tests: its routes are NOT served by the product.
app = FastAPI()


@app.get("/boom")
def boom():
    raise RuntimeError("boom")
