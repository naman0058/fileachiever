"""
Seed the SQLite database with demo admin, 8 users, training data, quotes,
suggestions, assessment questions, emergency contacts, sample chats/moods.
Run once: python seed_database.py
"""
import json
from datetime import datetime, timedelta

from app import create_app, db
from app.ml.train import train_and_save
from app.models import (
    Admin,
    AssessmentQuestion,
    AssessmentResult,
    ChatHistory,
    EmergencyContact,
    EmotionLabel,
    Feedback,
    MoodEntry,
    MotivationalQuote,
    Suggestion,
    TrainingData,
    User,
)


def seed():
    app = create_app()
    with app.app_context():
        if Admin.query.first():
            print("Database already contains an admin. Skipping seed (delete mental_health.db to re-seed).")
            return

        admin = Admin(username="admin")
        admin.set_password("admin123")
        db.session.add(admin)

        users_data = [
            ("Alice Johnson", "alice@example.com", "alice", 22, "Female"),
            ("Bob Smith", "bob@example.com", "bob", 24, "Male"),
            ("Carol Davis", "carol@example.com", "carol", 21, "Female"),
            ("David Lee", "david@example.com", "david", 23, "Male"),
            ("Emma Wilson", "emma@example.com", "emma", 20, "Female"),
            ("Frank Brown", "frank@example.com", "frank", 25, "Male"),
            ("Grace Kim", "grace@example.com", "grace", 19, "Female"),
            ("Henry Clark", "henry@example.com", "henry", 26, "Male"),
        ]
        user_objs = []
        for full_name, email, username, age, gender in users_data:
            u = User(full_name=full_name, email=email, username=username, age=age, gender=gender)
            u.set_password("password123")
            db.session.add(u)
            user_objs.append(u)
        db.session.flush()

        training_rows = [
            ("hello there", "greeting", "Hi, I am glad you are here. How are you feeling today?", "neutral"),
            ("hi good morning", "greeting", "Good morning. I am here to listen whenever you are ready.", "happy"),
            ("I feel so stressed with work", "stress", "Stress can feel heavy. Try a 5-minute pause: unclench jaw, drop shoulders, and breathe in for 4 and out for 6.", "stressed"),
            ("everything is overwhelming", "stress", "When everything piles up, pick one tiny next step. You do not have to solve it all at once.", "stressed"),
            ("I feel sad and empty", "sadness", "Sadness is a feeling, not a verdict. If you can, name one gentle thing you need right now.", "sad"),
            ("I cannot stop crying", "sadness", "Crying can be your body releasing tension. Wrap yourself in something warm and hydrate when you can.", "sad"),
            ("I am anxious about everything", "anxiety", "Anxiety can make the mind race. Ground yourself: name 5 things you can see and 3 things you can touch.", "anxious"),
            ("panic and worry", "anxiety", "Try box breathing: inhale 4, hold 4, exhale 4, hold 4, repeat three times.", "anxious"),
            ("I feel so alone", "loneliness", "Loneliness hurts. You still deserve connection. Consider messaging a trusted friend or a support line.", "lonely"),
            ("nobody understands me", "loneliness", "Feeling misunderstood is painful. Your experience still matters.", "lonely"),
            ("I cannot sleep at night", "sleep issue", "Sleep struggles are common. Dim screens, keep a consistent wake time, and avoid caffeine late.", "neutral"),
            ("I am tired but wired", "sleep issue", "Try a wind-down routine: same bedtime, light reading, gentle music.", "stressed"),
            ("I feel angry all the time", "anger", "Anger often signals a boundary or need. Write one sentence about what you wish were different.", "angry"),
            ("I need motivation", "motivation need", "Motivation can follow tiny actions. What is one 2-minute step you can take today?", "neutral"),
            ("thank you so much", "thanks", "You are welcome. I am here whenever you want to talk.", "happy"),
            ("bye for now", "goodbye", "Take care of yourself. I will be here when you return.", "neutral"),
            ("I feel okay", "neutral", "Thanks for checking in. If anything shifts, you can share more anytime.", "neutral"),
        ]
        for pattern, intent, response, emo in training_rows:
            db.session.add(TrainingData(pattern=pattern, intent=intent, response=response, emotion_tag=emo))

        for name, desc, tmpl in [
            ("happy", "Positive affect", "It is okay to notice good moments."),
            ("sad", "Low mood", "Your feelings deserve compassion."),
            ("stressed", "High pressure", "Pause and breathe; you are not alone in feeling overloaded."),
            ("anxious", "Worry and tension", "Grounding exercises can help steady the nervous system."),
            ("angry", "Frustration", "Anger can signal needs; try to name what you value underneath."),
            ("lonely", "Isolation", "Connection matters; small steps can help."),
            ("neutral", "Balanced", "Thanks for sharing what is on your mind."),
        ]:
            db.session.add(EmotionLabel(name=name, description=desc, response_template=tmpl))

        quotes = [
            ("You are allowed to feel this and still be worthy of care.", "MindCare"),
            ("Small steps are still progress.", "Anonymous"),
            ("Rest is not a reward; it is a requirement.", "Anonymous"),
            ("Breathing is the bridge between body and mind.", "Anonymous"),
            ("Courage does not always roar; sometimes it is a quiet decision to try again.", "Mary Anne Radmacher"),
        ]
        for qt, auth in quotes:
            db.session.add(MotivationalQuote(quote_text=qt, author=auth))

        suggestions = [
            ("Drink a glass of water.", "stressed", "Stressed", "High stress"),
            ("Take a 5-minute walk outside.", "anxious", "Anxious", "Moderate stress"),
            ("Write three lines in a journal.", "sad", "Sad", "Low stress"),
            ("Try 4-7-8 breathing for one minute.", "anxious", None, None),
            ("Reduce screen brightness before bed.", None, None, "High stress"),
            ("Message someone you trust when you can.", "lonely", None, None),
        ]
        for text, et, mt, st in suggestions:
            db.session.add(Suggestion(text=text, emotion_type=et.strip() if et else None, mood_type=mt, stress_level=st))

        emergency = [
            ("Emergency", "If you are in immediate danger, call your local emergency number (e.g., 911 in the US)."),
            ("Campus counseling", "Example: Campus Wellness Center — Mon–Fri 9–5, Room 120, Main Hall."),
            ("Crisis line (example)", "Example: National Suicide Prevention Lifeline — dial 988 in the US (verify for your region)."),
        ]
        for i, (title, detail) in enumerate(emergency):
            db.session.add(EmergencyContact(title=title, detail_text=detail, sort_order=i))

        questions = [
            (
                "How would you rate your stress level this week?",
                1,
                ["Low", "Moderate", "High"],
                [1, 3, 6],
            ),
            (
                "How was your sleep quality?",
                2,
                ["Poor", "Fair", "Good"],
                [4, 2, 0],
            ),
            (
                "How is your concentration?",
                3,
                ["Low", "Medium", "High"],
                [4, 2, 0],
            ),
            (
                "Interest in daily activities?",
                4,
                ["Very low", "Some", "Good"],
                [5, 2, 0],
            ),
            (
                "Energy level today?",
                5,
                ["Very low", "Moderate", "High"],
                [5, 2, 0],
            ),
        ]
        for text, order, opts, scores in questions:
            db.session.add(
                AssessmentQuestion(
                    question_text=text,
                    order_index=order,
                    options_json=json.dumps(opts),
                    scores_json=json.dumps(scores),
                )
            )

        db.session.flush()

        # Sample moods and chats for first 3 users
        for i, u in enumerate(user_objs[:3]):
            db.session.add(MoodEntry(user_id=u.id, mood=["Happy", "Stressed", "Normal"][i % 3], created_at=datetime.utcnow() - timedelta(days=i)))
            db.session.add(
                ChatHistory(
                    user_id=u.id,
                    user_message="I feel anxious about exams",
                    bot_reply="Try grounding: name 5 things you see and 3 you can touch.",
                    intent="anxiety",
                    emotion="anxious",
                    created_at=datetime.utcnow() - timedelta(hours=2 * i),
                )
            )

        db.session.add(
            AssessmentResult(
                user_id=user_objs[0].id,
                score=12,
                category="Moderate stress",
                answers_json=json.dumps({"1": "Moderate"}),
            )
        )

        db.session.add(Feedback(user_id=user_objs[0].id, rating=5, comment="Helpful responses."))
        db.session.add(Feedback(user_id=user_objs[1].id, rating=4, comment="Good suggestions."))

        db.session.commit()
        print("Seed done: users alice..henry (password: password123), admin/admin123")

        res = train_and_save(app.config["ML_MODEL_DIR"])
        print("Model training:", res.get("message", res))


if __name__ == "__main__":
    seed()
