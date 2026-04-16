"""
Seed database with 7–8 dummy users, farms, monitoring rows, predictions, and feedback.
Run: python seed_data.py
Requires app context and existing tables (run app once or flask shell).
"""
import json
import os
import sys

# Ensure project root on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from extensions import db
from models import (
    CropMonitoringEntry,
    Farm,
    Feedback,
    PredictionHistory,
    SoilHealthRecord,
    User,
)


def seed():
    with app.app_context():
        users_data = [
            ("Priya Sharma", "priya.sharma@example.com", "9876500101", "priya_s", "farmer123"),
            ("Rajesh Kumar", "rajesh.k@example.com", "9876500102", "rajesh_k", "farmer123"),
            ("Anita Desai", "anita.d@example.com", "9876500103", "anita_d", "farmer123"),
            ("Vikram Singh", "vikram.s@example.com", "9876500104", "vikram_s", "farmer123"),
            ("Meera Iyer", "meera.i@example.com", "9876500105", "meera_i", "farmer123"),
            ("Suresh Patel", "suresh.p@example.com", "9876500106", "suresh_p", "farmer123"),
            ("Kavitha Nair", "kavitha.n@example.com", "9876500107", "kavitha_n", "farmer123"),
            ("Arun Reddy", "arun.r@example.com", "9876500108", "arun_r", "farmer123"),
        ]
        for full_name, email, phone, username, pw in users_data:
            if User.query.filter_by(username=username).first():
                continue
            u = User(
                full_name=full_name,
                email=email,
                phone=phone,
                username=username,
                address="Sample Village, India",
                security_question="What is your favourite crop?",
            )
            u.set_password(pw)
            u.set_security_answer("rice")
            db.session.add(u)
            db.session.flush()

        db.session.commit()

        for u in User.query.filter(User.role == "user").order_by(User.id.desc()).limit(8).all():
            if Farm.query.filter_by(user_id=u.id).first():
                continue
            part = u.username.replace("_", " ").title().split()[0] if u.username else "User"
            f1 = Farm(
                user_id=u.id,
                farm_name=f"{part} Farm 1",
                location_name="District A",
                total_area_ha=4.5 + (u.id % 5),
                soil_type="Loamy",
                irrigation_type="Drip",
                main_crop="rice",
            )
            db.session.add(f1)
            db.session.flush()
            db.session.add(
                CropMonitoringEntry(
                    user_id=u.id,
                    farm_id=f1.id,
                    temperature=26.0,
                    humidity=72.0,
                    rainfall=120.0,
                    soil_moisture=45.0,
                    soil_ph=6.5,
                    nitrogen=90.0,
                    phosphorus=42.0,
                    potassium=43.0,
                    crop_season="Kharif",
                    crop_name="rice",
                    previous_yield=3200.0,
                    is_final=True,
                )
            )
            db.session.add(
                PredictionHistory(
                    user_id=u.id,
                    farm_id=f1.id,
                    prediction_type="crop",
                    input_json=json.dumps(
                        {
                            "N": 90,
                            "P": 42,
                            "K": 43,
                            "temperature": 26,
                            "humidity": 72,
                            "rainfall": 120,
                            "ph": 6.5,
                        }
                    ),
                    result_label="rice",
                    result_detail="Seed example",
                )
            )
            db.session.add(
                SoilHealthRecord(
                    user_id=u.id,
                    farm_id=f1.id,
                    nitrogen=90,
                    phosphorus=42,
                    potassium=43,
                    soil_ph=6.5,
                    soil_moisture=45,
                    condition_label="Moderate",
                )
            )
            db.session.add(
                Feedback(
                    user_id=u.id,
                    subject="General",
                    message=f"Hello from {u.full_name} — the dashboard looks good.",
                    status="pending",
                )
            )

        db.session.commit()
        print("Seed completed: up to 8 users with farms, monitoring, predictions, soil, feedback.")


if __name__ == "__main__":
    seed()
