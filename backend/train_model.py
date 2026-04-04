from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


DEFAULT_DATASET = Path("data/crop_dataset/Crop Yeild Data.csv")
DEFAULT_OUTPUT_DIR = Path("model_artifacts")
TARGET_COLUMN = "Yield"


def build_pipeline(categorical_features: list[str], numeric_features: list[str]) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical_features),
            ("numeric", "passthrough", numeric_features),
        ]
    )

    model = RandomForestRegressor(
        n_estimators=400,
        random_state=42,
        n_jobs=1,
        min_samples_leaf=2,
    )

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    for col in ["Crop", "Season", "State"]:
        cleaned[col] = cleaned[col].astype(str).str.strip()
    return cleaned


def train(dataset_path: Path, output_dir: Path) -> dict:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(dataset_path)
    df = clean_dataframe(df)

    feature_columns = [col for col in df.columns if col != TARGET_COLUMN]
    categorical_features = ["Crop", "Season", "State"]
    numeric_features = [col for col in feature_columns if col not in categorical_features]

    x = df[feature_columns]
    y = df[TARGET_COLUMN]

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
    )

    pipeline = build_pipeline(categorical_features, numeric_features)
    pipeline.fit(x_train, y_train)

    predictions = pipeline.predict(x_test)
    metrics = {
        "mae": float(mean_absolute_error(y_test, predictions)),
        "rmse": float(root_mean_squared_error(y_test, predictions)),
        "r2": float(r2_score(y_test, predictions)),
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
    }

    model_path = output_dir / "crop_yield_model.joblib"
    metadata_path = output_dir / "crop_yield_model_metadata.json"
    joblib.dump(
        {
            "model": pipeline,
            "feature_columns": feature_columns,
            "categorical_features": categorical_features,
            "numeric_features": numeric_features,
            "target_column": TARGET_COLUMN,
        },
        model_path,
    )

    metadata = {
        "dataset_path": str(dataset_path.resolve()),
        "model_path": str(model_path.resolve()),
        "target_column": TARGET_COLUMN,
        "feature_columns": feature_columns,
        "metrics": metrics,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train crop yield regression model from CSV dataset.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET,
        help=f"Path to dataset CSV (default: {DEFAULT_DATASET})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory for model artifacts (default: {DEFAULT_OUTPUT_DIR})",
    )
    args = parser.parse_args()

    result = train(dataset_path=args.dataset, output_dir=args.output_dir)
    print("Training complete.")
    print(json.dumps(result["metrics"], indent=2))
    print(f"Model saved to: {result['model_path']}")


if __name__ == "__main__":
    main()
