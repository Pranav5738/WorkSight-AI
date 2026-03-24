"""Monitoring package for employee work activity detection.

Modules:
- camera_feed: video capture abstraction (webcam/CCTV)
- activity_detector: pose/activity estimation
- tracker: simple person tracking across frames
- alert_manager: manager notification integration
- main: service orchestrator used by FastAPI background task or CLI
"""
