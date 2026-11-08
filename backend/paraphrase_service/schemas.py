from pydantic import BaseModel, Field


class ParaphraseRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Input text to paraphrase")


class ParaphraseResponse(BaseModel):
    paraphrased: str = Field(..., description="Paraphrased text preserving meaning")
