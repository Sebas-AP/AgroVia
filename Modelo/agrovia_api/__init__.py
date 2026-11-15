"""AgroVia parcel-evaluation FastAPI service.

The service accepts a detailed parcel profile, queries the satellite APIs it
depends on (NASA POWER and ORNL DAAC MODIS NDVI), and combines those data with
the trained scikit-learn artifacts that live in this ``Modelo`` folder.
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.1.0"
