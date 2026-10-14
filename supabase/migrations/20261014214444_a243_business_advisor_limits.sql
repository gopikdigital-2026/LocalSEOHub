/*
# A2.4.3 - AI Business Advisor monthly limits

1. Changes
- Redefines `public.ai_usage_cap(p_function)` with the new monthly distribution:
  weekly-content 25, business-improvement 20, seo-generator 20, business-advisor 15,
  voice-simulator 0, global 80 (25+20+20+15 = 80; global ceiling unchanged).
- `reserve_ai_usage` and `my_ai_usage` already read their caps from this function,
  so no other object changes.

2. Data
- No rows are reset or rewritten. Users already above a new cap this month are simply
  refused new reservations for that function until next month (counters never go negative).

3. Security
- Same privileges as before: no EXECUTE for PUBLIC or anon.
*/

CREATE OR REPLACE FUNCTION public.ai_usage_cap(p_function text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_function
    WHEN 'weekly-content' THEN 25
    WHEN 'business-improvement' THEN 20
    WHEN 'seo-generator' THEN 20
    WHEN 'business-advisor' THEN 15
    WHEN 'voice-simulator' THEN 0
    WHEN 'global' THEN 80
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_cap(text) FROM PUBLIC, anon;
