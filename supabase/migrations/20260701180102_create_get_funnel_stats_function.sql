CREATE OR REPLACE FUNCTION get_funnel_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'page_views',       COUNT(*) FILTER (WHERE event_name = 'page_view'),
    'widget_scans',     COUNT(*) FILTER (WHERE event_name = 'widget_scan_start'),
    'scan_results',     COUNT(*) FILTER (WHERE event_name = 'widget_scan_result'),
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
$$;
