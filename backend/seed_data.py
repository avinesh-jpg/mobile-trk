import os
from app.db.session import SessionLocal
from app.db.models import User, Geofence
from app.core.security import get_password_hash

def seed():
    db = SessionLocal()
    try:
        # Check if admin already exists
        admin = db.query(User).filter(User.email == "admin@company.com").first()
        if not admin:
            admin = User(
                name="Head Operations Admin",
                email="admin@company.com",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                is_active=True
            )
            db.add(admin)
            print("Created Admin user: admin@company.com (password: admin123)")
        else:
            print("Admin user already exists.")

        # Check if sample employee exists
        employee = db.query(User).filter(User.email == "employee@company.com").first()
        if not employee:
            employee = User(
                name="John Field Tech",
                email="employee@company.com",
                hashed_password=get_password_hash("emp123"),
                role="employee",
                is_active=True
            )
            db.add(employee)
            print("Created Employee user: employee@company.com (password: emp123)")
        else:
            print("Employee user already exists.")

        # Sample Geofences
        geo1 = db.query(Geofence).filter(Geofence.name == "Headquarters").first()
        if not geo1:
            geo1 = Geofence(
                name="Headquarters",
                client_name="Corporate Office",
                latitude=12.9716,
                longitude=77.5946,
                radius_meters=150.0
            )
            db.add(geo1)
            print("Created Geofence: Headquarters")

        geo2 = db.query(Geofence).filter(Geofence.name == "Apex Logistics Hub").first()
        if not geo2:
            geo2 = Geofence(
                name="Apex Logistics Hub",
                client_name="Apex Global",
                latitude=12.9352,
                longitude=77.6245,
                radius_meters=200.0
            )
            db.add(geo2)
            print("Created Geofence: Apex Logistics Hub")

        db.commit()
        print("Database seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print("Error seeding database:", e)
    finally:
        db.close()

if __name__ == "__main__":
    seed()
