#!/usr/bin/env python3
"""
Quick script to check Ch2 test visibility in Supabase database
"""

import os
import json
from supabase import create_client, Client

# Supabase credentials
SUPABASE_URL = "https://sozodkxwhubespiedgxm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvem9ka3h3aHViZXNwaWVkZ3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTUxNjYsImV4cCI6MjA3NzQ3MTE2Nn0.DBfFFWvVjpqXTga0uZcH5qR4ej6VOFBUm-CiCTgGLVA"

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 80)
print("CHECKING CH2 TEST VISIBILITY IN DATABASE")
print("=" * 80)

try:
    # Check for Ch2 visibility records
    print("\n1. CHECKING CAMBRIDGE_TEST_VISIBILITY TABLE FOR CH2 TESTS:")
    print("-" * 80)
    
    response = supabase.table("cambridge_test_visibility").select(
        "test_id, subject, grade_level, is_visible, teacher_user_id, created_at, updated_at"
    ).ilike("test_id", "%ch2-atoms-molecules-stoichiometry%").execute()
    
    visibility_records = response.data
    if visibility_records:
        print(f"Found {len(visibility_records)} visibility record(s):\n")
        for record in visibility_records:
            print(f"  Test ID: {record['test_id']}")
            print(f"    Grade: {record['grade_level']}, Subject: {record['subject']}")
            print(f"    Visible: {record['is_visible']}")
            print(f"    Teacher ID: {record['teacher_user_id']}")
            print(f"    Updated: {record['updated_at']}\n")
    else:
        print("  ⚠️  NO VISIBILITY RECORDS FOUND for Ch2 tests!")
        print("  This means visibility has NOT been configured for these tests.\n")

    # Check if tests exist in cambridge_tests table
    print("\n2. CHECKING CAMBRIDGE_TESTS CATALOG:")
    print("-" * 80)
    
    response = supabase.table("cambridge_tests").select(
        "id, name, subject, test_url"
    ).ilike("id", "%ch2-atoms-molecules-stoichiometry%").execute()
    
    test_records = response.data
    if test_records:
        print(f"Found {len(test_records)} test(s) in catalog:\n")
        for test in test_records:
            print(f"  ID: {test['id']}")
            print(f"    Name: {test['name']}")
            print(f"    Subject: {test['subject']}")
            print(f"    URL: {test['test_url']}\n")
    else:
        print("  ⚠️  TESTS NOT FOUND in catalog!")

    # Check Chemistry visibility stats
    print("\n3. OVERALL CHEMISTRY TEST VISIBILITY STATS:")
    print("-" * 80)
    
    response = supabase.table("cambridge_test_visibility").select(
        "is_visible"
    ).eq("subject", "Chemistry").execute()
    
    all_chemistry = response.data
    visible_count = sum(1 for r in all_chemistry if r['is_visible'])
    hidden_count = sum(1 for r in all_chemistry if not r['is_visible'])
    
    print(f"  Total visibility records: {len(all_chemistry)}")
    print(f"  Visible (is_visible=TRUE): {visible_count}")
    print(f"  Hidden (is_visible=FALSE): {hidden_count}\n")

    # Show teacher breakdown
    print("\n4. VISIBILITY BY TEACHER & GRADE (Chemistry):")
    print("-" * 80)
    
    response = supabase.table("cambridge_test_visibility").select(
        "teacher_user_id, grade_level, is_visible"
    ).eq("subject", "Chemistry").execute()
    
    teacher_breakdown = {}
    for record in response.data:
        teacher_id = record['teacher_user_id']
        grade = record['grade_level']
        is_vis = record['is_visible']
        
        key = (teacher_id, grade, is_vis)
        teacher_breakdown[key] = teacher_breakdown.get(key, 0) + 1
    
    for (teacher_id, grade, is_vis), count in sorted(teacher_breakdown.items()):
        status = "VISIBLE ✓" if is_vis else "HIDDEN ✗"
        print(f"  Teacher {teacher_id[:8]}... | Grade {grade} | {status}: {count} tests")

    print("\n" + "=" * 80)
    print("DIAGNOSIS:")
    print("=" * 80)
    
    if not visibility_records:
        print("⚠️  CH2 TESTS HAVE NO VISIBILITY SETTINGS")
        print("\nThis explains why students can see them!")
        print("\nWhen there are no visibility records:")
        print("  - The RPC function 'get_visible_cambridge_tests_for_student()' returns NO DATA")
        print("  - The frontend treats 'no data' as 'system not set up'")
        print("  - The frontend FALLS BACK to showing ALL tests")
        print("\nSOLUTION:")
        print("  A teacher must explicitly hide these tests using the Visibility Manager:")
        print("  1. Go to Teacher Portal → Cambridge Tests")
        print("  2. Click '👁️ Test Visibility' button")
        print("  3. Find 'AS Chemistry Ch2' tests and click '🔒 Hide' button")
        print("  4. This will create visibility records with is_visible=FALSE")
        print("  5. Students will then NOT see these tests\n")
    else:
        for record in visibility_records:
            if record['is_visible']:
                print(f"✓ {record['test_id']}: VISIBLE (is_visible=TRUE)")
            else:
                print(f"✗ {record['test_id']}: HIDDEN (is_visible=FALSE)")
                print("\n⚠️  BUT IF HIDDEN, WHY ARE STUDENTS SEEING IT?")
                print("This suggests the frontend fallback logic is being triggered.")
                print("Check browser console for 'Error fetching visible tests' errors.")

except Exception as e:
    print(f"\n❌ ERROR: {str(e)}")
    print(f"\nCould not connect to Supabase. Check your credentials.")
    print(f"URL: {SUPABASE_URL}")
    import traceback
    traceback.print_exc()
