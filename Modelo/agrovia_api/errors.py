"""Domain errors raised by the AgroVia evaluation service."""

from __future__ import annotations


class EvaluationError(Exception):
    """Base class for recoverable parcel-evaluation failures."""


class InvalidCropError(EvaluationError):
    """The requested crop is not part of the INIFAP catalogue."""


class InvalidModalityError(EvaluationError):
    """The requested irrigation system does not map to a trained modality."""


class InvalidParcelError(EvaluationError):
    """The parcel profile is internally inconsistent."""
