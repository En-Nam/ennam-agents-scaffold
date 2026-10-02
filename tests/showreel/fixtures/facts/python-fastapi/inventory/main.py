from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter()


@app.get("/health")
def health():
    return {"ok": True}


@router.post('/items')
def create_item():
    ...


@router.get("/items/{item_id}")
def read_item(item_id: int):
    ...
