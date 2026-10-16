/*
# A2.4.8 - Voice Simulator monthly limits (redistribution, global unchanged)

1. Changes
- Redefines `public.ai_usage_cap(p_function)` with the new monthly distribution:
  weekly-content 22, business-improvement 18, seo-generator 18, business-advisor 12,
  voice-simulator 10, global 80 (22+18+18+12+10 = 80; global ceiling unchanged).
- `reserve_ai_usage` and `my_ai_usage` already read their caps from this function,
  so no other object changes. Same monthly UTC period, same reservation/settlement flow.

2. Data
- No rows are reset or rewritten. At the time of writing no user is above any new cap.
  Anyone above a lowered cap would simply be refused new reservations for that function
  until next month (counters never go negative).

3. Security
- Same privileges as before: no EXECUTE for PUBLIC or anon. No RLS or policy changes.
*/

CREATE OR REPLACE FUNCTION public.ai_usage_cap(p_function text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_function
    WHEN 'weekly-content' THEN 22
    WHEN 'business-improvement' THEN 18
    WHEN 'seo-generator' THEN 18
    WHEN 'business-advisor' THEN 12
    WHEN 'voice-simulator' THEN 10
    WHEN 'global' THEN 80
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_cap(text) FROM PUBLIC, anon;
