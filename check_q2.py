"""Check if question 2 is properly formatted."""

with open(r'public\cambridge-tests\Biology\cell_structure.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the questions array start
import re
start = content.find('let QUESTIONS = [')
end = content.find('];', start)

if start != -1 and end != -1:
    questions_text = content[start:end+2]
    
    # Try to find question 2
    q2_pattern = r"number:\s*2,[^}]*?code:\s*'9700_s20_qp_11 Q: 1',[^}]*?\}"
    q2_match = re.search(q2_pattern, questions_text, re.DOTALL)
    
    if q2_match:
        q2_text = q2_match.group(0)
        print("Question 2 found:")
        print("=" * 80)
        print(q2_text[:500])
        print("=" * 80)
        
        # Check for issues
        if '\\"' in q2_text:
            print("WARNING: Found escaped quotes (\\\") in the prompt!")
            print("This will break JSON parsing.")
        
        # Count opening and closing braces
        open_braces = q2_text.count('{')
        close_braces = q2_text.count('}')
        print("\nBrace count: open", open_braces, "and close", close_braces)
        
        if open_braces != close_braces:
            print("WARNING: Mismatched braces!")
    else:
        print("Question 2 not found")
else:
    print("QUESTIONS array not found")
