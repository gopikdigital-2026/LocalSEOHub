-- Unify hero_analysis_start with widget_scan_start and analysis_completed with widget_scan_result
-- so the funnel counts both the hero "Analizar Gratis" button and the widget scan tools.

CREATE OR REPLACE FUNCTION public.get_funnel_stats(since timestamp with time zone DEFAULT NULL, until timestamp with time zone DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
SELECT jsonb_build_object(
'page_views',       COUNT(*) FILTER (WHERE event_name = 'page_view'),
'widget_scans',     COUNT(*) FILTER (WHERE event_name IN ('widget_scan_start', 'hero_analysis_start')),
'scan_results',     COUNT(*) FILTER (WHERE event_name IN ('widget_scan_result', 'analysis_completed')),
'gates_shown',      COUNT(*) FILTER (WHERE event_name = 'gate_shown'),
'register_clicks',  COUNT(*) FILTER (WHERE event_name = 'gate_register_click'),
'logins',           COUNT(*) FILTER (WHERE event_name = 'login_success'),
'registrations',    COUNT(*) FILTER (WHERE event_name = 'register_success'),
'tool_opens',       COUNT(*) FILTER (WHERE event_name = 'tool_open'),
'tool_generates',   COUNT(*) FILTER (WHERE event_name = 'tool_generate'),
'unique_sessions',  COUNT(DISTINCT session_id),
'by_tool', (
SELECT COALESCE(jsonb_object_agg(tool, cnt), '{}'::jsonb)
FROM (
SELECT properties->>'tool' AS tool, COUNT(*) AS cnt
FROM analytics_events
WHERE event_name = 'tool_generate'
AND properties->>'tool' IS NOT NULL
AND (since IS NULL OR created_at >= since)
AND (until IS NULL OR created_at <= until)
GROUP BY properties->>'tool'
) t
),
'daily', (
SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.fecha), '[]'::jsonb)
FROM (
SELECT DATE(created_at) AS fecha,
COUNT(*) AS events,
COUNT(DISTINCT session_id) AS sessions
FROM analytics_events
WHERE (since IS NULL OR created_at >= since)
AND (until IS NULL OR created_at <= until)
GROUP BY DATE(created_at)
) d
)
)
FROM analytics_events
WHERE (since IS NULL OR created_at >= since)
AND (until IS NULL OR created_at <= until);
$function$;

-- Also update the no-args overload for consistency
CREATE OR REPLACE FUNCTION public.get_funnel_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
SELECT jsonb_build_object(
'page_views',       COUNT(*) FILTER (WHERE event_name = 'page_view'),
'widget_scans',     COUNT(*) FILTER (WHERE event_name IN ('widget_scan_start', 'hero_analysis_start')),
'scan_results',     COUNT(*) FILTER (WHERE event_name IN ('widget_scan_result', 'analysis_completed')),
'gates_shown',      COUNT(*) FILTER (WHERE event_name = 'gate_shown'),
'register_clicks',  COUNT(*) FILTER (WHERE event_name = 'gate_register_click'),
'logins',           COUNT(*) FILTER (WHERE event_name = 'login_success'),
'registrations',    COUNT(*) FILTER (WHERE event_name = 'register_success'),
'tool_opens',       COUNT(*) FILTER (WHERE event_name = 'tool_open'),
'tool_generates',   COUNT(*) FILTER (WHERE event_name = 'tool_generate'),
'unique_sessions',  COUNT(DISTINCT session_id),
'by_tool', (
SELECT jsonb_object_agg(tool, cnt)
FROM (
SELECT properties->>'tool' AS tool, COUNT(*) AS cnt
FROM analytics_events
WHERE event_name = 'tool_generate' AND properties->>'tool' IS NOT NULL
GROUP BY properties->>'tool'
) t
),
'daily', (
SELECT jsonb_agg(row_to_json(d) ORDER BY d.fecha)
FROM (
SELECT DATE(created_at) AS fecha, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions
FROM analytics_events
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
) d
)
)
FROM analytics_events;
$function$;
