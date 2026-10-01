from fastapi import APIRouter

# Mounted by its own prefix: the served route is GET /items/{id}, never GET /{id}.
router = APIRouter(prefix="/items", tags=["items"])


@router.get("/{id}")
def get_item(id: int):
    ...
