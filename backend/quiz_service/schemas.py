from typing import List, Literal                                                                              
                                                                                                                
from pydantic import BaseModel, Field, conint, constr, model_validator                                        

QuizDifficulty = Literal["easy", "normal", "hard"]                                                            
                                                                                                                
                                                                                                                
class DifficultyMix(BaseModel):                                                                               
      easy: conint(ge=0, le=10) = Field(2, description="How many easy questions to create")                     
      normal: conint(ge=0, le=10) = Field(2, description="How many normal questions to create")                 
      hard: conint(ge=0, le=10) = Field(1, description="How many hard questions to create")                     
                                                                                                                
      @model_validator(mode="after")                                                                            
      def ensure_total(self):                                                                                   
          total = self.easy + self.normal + self.hard                                                           
          if total <= 0:                                                                                        
              raise ValueError("Request at least one question.")                                                
          return self                                                                                           
                                                                                                                
      @property                                                                                                 
      def total(self) -> int:                                                                                   
          return int(self.easy + self.normal + self.hard)                                                       
                                                                                                                
                                                                                                                
class GenerateQuizRequest(BaseModel):                                                                         
      title: constr(strip_whitespace=True, min_length=1, max_length=300)  # type: ignore[arg-type]              
      text: constr(strip_whitespace=True, min_length=120)  # type: ignore[arg-type]                             
      difficultyMix: DifficultyMix = Field(default_factory=DifficultyMix)                                       
                                                                                                                
                                                                                                                
class QuizQuestion(BaseModel):                                                                                
      id: str                                                                                                   
      question: constr(strip_whitespace=True, min_length=3)  # type: ignore[arg-type]                           
      options: List[str] = Field(..., min_items=4, max_items=4)                                                 
      answerIndex: conint(ge=0, le=3)                                                                           
      difficulty: QuizDifficulty                                                                                
      explanation: str | None = None                                                                            
                                                                                                                
                                                                                                                
class GenerateQuizResponse(BaseModel):                                                                        
      questions: List[QuizQuestion]                                                                             
                                                                                                                
  