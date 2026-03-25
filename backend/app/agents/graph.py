"""
LangGraph state machine for AI Test Copilot.

                    ┌─────────────────────┐
                    │   ingest_and_index  │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │ generate_test_cases │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
          ┌─────────│    human_review     │◄──────────────┐
          │ approve └────────┬────────────┘ improve loop  │
          │                  │ reject/feedback            │
          │         ┌────────▼────────────┐               │
          │         │  improve_test_cases │───────────────┘
          │         └─────────────────────┘
          │
          ▼
  ┌───────────────────┐
  │  request_test_data│  ← INTERRUPT: await_test_data
  └────────┬──────────┘
           │
  ┌────────▼──────────────────┐
  │  generate_automated_tests │
  └────────┬──────────────────┘
           │
  ┌────────▼──────┐
  │ execute_tests │
  └────────┬──────┘
           │
          END
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from app.agents.nodes import (
    execute_tests,
    generate_automated_tests,
    generate_test_cases,
    has_test_data,
    human_review,
    improve_test_cases,
    ingest_and_index,
    request_test_data,
    should_improve_or_proceed,
)
from app.agents.state import TestCopilotState


def build_graph() -> StateGraph:
    builder = StateGraph(TestCopilotState)

    # Nodes
    builder.add_node("ingest_and_index", ingest_and_index)
    builder.add_node("generate_test_cases", generate_test_cases)
    builder.add_node("human_review", human_review)
    builder.add_node("improve_test_cases", improve_test_cases)
    builder.add_node("request_test_data", request_test_data)
    builder.add_node("generate_automated_tests", generate_automated_tests)
    builder.add_node("execute_tests", execute_tests)

    # Edges
    builder.set_entry_point("ingest_and_index")
    builder.add_edge("ingest_and_index", "generate_test_cases")
    builder.add_edge("generate_test_cases", "human_review")

    # After human_review interrupt resumes — branch on approval
    builder.add_conditional_edges(
        "human_review",
        should_improve_or_proceed,
        {
            "approved": "request_test_data",
            "needs_improvement": "improve_test_cases",
        },
    )

    # Improve loops back to human_review for another round
    builder.add_edge("improve_test_cases", "human_review")

    # After test data is uploaded — branch on data presence
    builder.add_conditional_edges(
        "request_test_data",
        has_test_data,
        {
            "has_data": "generate_automated_tests",
            "waiting": "request_test_data",  # stay until data arrives
        },
    )

    builder.add_edge("generate_automated_tests", "execute_tests")
    builder.add_edge("execute_tests", END)

    checkpointer = MemorySaver()
    return builder.compile(
        checkpointer=checkpointer,
        # generate_automated_tests is intercepted by the background task for
        # per-TC progressive generation with progress updates via g.update_state().
        # The graph node itself becomes a no-op that simply checks the file exists.
        interrupt_before=["generate_test_cases", "human_review", "request_test_data", "generate_automated_tests"],
    )


# Module-level singleton
graph = build_graph()
