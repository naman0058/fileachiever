"""
Seed SQLite with admin, sample users, predictions, feedback, and a demo model.
Run from project root: python seed_data.py
"""
import os
import sys

from PIL import Image

# Ensure project root on path
ROOT = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, ROOT)

from app import create_app
from app.extensions import db
from app.ml_service import create_demo_model
from app.models import Feedback, Prediction, SystemSetting, User


def main():
    app = create_app()
    os.makedirs(os.path.join(ROOT, "uploads", "mri"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "instance"), exist_ok=True)

    with app.app_context():
        db.drop_all()
        db.create_all()

        for key, val in [
            ("allowed_extensions", "png,jpg,jpeg"),
            ("max_upload_mb", "8"),
            ("model_path", os.path.join(ROOT, "instance", "tumor_model.joblib")),
        ]:
            db.session.add(SystemSetting(key=key, value=val))

        admin = User(
            full_name="System Administrator",
            email="admin@brainscan.local",
            username="admin",
            role="admin",
            security_question="What is the master code?",
            is_active=True,
        )
        admin.set_password("Admin@123")
        admin.set_security_answer("neuro2026")
        db.session.add(admin)

        users_data = [
            ("Alice Chen", "alice@example.com", "alice_c", "User@123", "paris"),
            ("Bob Kumar", "bob@example.com", "bob_k", "User@123", "mumbai"),
            ("Carol Diaz", "carol@example.com", "carol_d", "User@123", "madrid"),
            ("David Wu", "david@example.com", "david_w", "User@123", "shanghai"),
            ("Elena Rossi", "elena@example.com", "elena_r", "User@123", "rome"),
            ("Frank Miller", "frank@example.com", "frank_m", "User@123", "boston"),
        ]
        created_users = []
        for full_name, email, username, pw, city in users_data:
            u = User(
                full_name=full_name,
                email=email,
                username=username,
                role="user",
                security_question="What city were you born in?",
                is_active=True,
            )
            u.set_password(pw)
            u.set_security_answer(city)
            db.session.add(u)
            created_users.append((u, email, username))

        db.session.flush()

        labels = [
            ("Glioma", True),
            ("Meningioma", True),
            ("Pituitary", True),
            ("No Tumor", False),
            ("Glioma", True),
            ("No Tumor", False),
            ("Meningioma", True),
        ]
        confidences = [0.87, 0.78, 0.91, 0.82, 0.76, 0.88, 0.79]

        for i, ((u, _email, _uname), (label, is_tumor), conf) in enumerate(
            zip(created_users, labels, confidences)
        ):
            img_path = os.path.join(ROOT, "uploads", "mri", f"seed_{u.id}_{i}.png")
            im = Image.new("RGB", (128, 128), color=(40 + i * 10, 50, 60 + i * 5))
            im.save(img_path)
            db.session.add(
                Prediction(
                    user_id=u.id,
                    original_filename=f"sample_mri_{i}.png",
                    stored_path=img_path,
                    result_label=label,
                    confidence=conf,
                    is_tumor=is_tumor,
                )
            )

        db.session.add(
            Feedback(
                user_id=None,
                name="Visitor",
                email="visitor@example.com",
                subject="Question about MRI",
                message="We would like to know more about supported image formats.",
            )
        )
        db.session.add(
            Feedback(
                user_id=created_users[0][0].id,
                name="Alice Chen",
                email="alice@example.com",
                subject="Great project",
                message="The dashboard is very clear. Thank you for the demo.",
            )
        )

        db.session.commit()

        model_path = os.path.join(ROOT, "instance", "tumor_model.joblib")
        metrics_path = os.path.join(ROOT, "instance", "training_metrics.json")
        create_demo_model(model_path, metrics_path)

        print("Seed complete.")
        print("  Admin: username=admin  password=Admin@123")
        print("  Users: alice_c / User@123  (and bob_k, carol_d, ... same password)")
        print(f"  Demo model: {model_path}")


if __name__ == "__main__":
    main()
