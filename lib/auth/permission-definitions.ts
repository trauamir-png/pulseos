/**
 * The single, centralized list of permission identifiers. Mirrored in
 * supabase/migrations/0012_site_permissions.sql's `permission_definitions`
 * seed -- if these two ever disagree, the database wins (an unknown key is
 * physically unwritable there via the FK on membership_permissions), but
 * nothing in application code should invent a permission string that isn't
 * listed here.
 */
export const PERMISSIONS = {
  ANALYTICS_DASHBOARD_VIEW: "analytics.dashboard.view",
  ANALYTICS_REALTIME_VIEW: "analytics.realtime.view",
  ANALYTICS_PAGES_VIEW: "analytics.pages.view",
  ANALYTICS_SOURCES_VIEW: "analytics.sources.view",
  ANALYTICS_EVENTS_VIEW: "analytics.events.view",
  PODCAST_OVERVIEW_VIEW: "podcast.overview.view",
  PODCAST_EPISODES_VIEW: "podcast.episodes.view",
  CONTENT_COLUMNS_VIEW: "content.columns.view",
  CONTENT_COLUMNS_CREATE: "content.columns.create",
  CONTENT_COLUMNS_EDIT_OWN: "content.columns.edit_own",
  CONTENT_COLUMNS_EDIT_ALL: "content.columns.edit_all",
  CONTENT_COLUMNS_PUBLISH: "content.columns.publish",
  CONTENT_COLUMNS_SCHEDULE: "content.columns.schedule",
  CONTENT_COLUMNS_DELETE: "content.columns.delete",
  CONTENT_AUTHORS_MANAGE: "content.authors.manage",
  CONTENT_CATEGORIES_MANAGE: "content.categories.manage",
  CONTENT_MEDIA_MANAGE: "content.media.manage",
  CONTENT_BANNERS_MANAGE: "content.banners.manage",
  CONTENT_STAND_MEDIA_VIEW: "content.stand_media.view",
  CONTENT_STAND_MEDIA_MANAGE: "content.stand_media.manage",
  CONTENT_MATCH_PANEL_PICKS_VIEW: "content.match_panel_picks.view",
  CONTENT_MATCH_PANEL_PICKS_MANAGE: "content.match_panel_picks.manage",
  CONTENT_MATCH_VOTING_VIEW: "content.match_voting.view",
  CONTENT_MATCH_VOTING_MANAGE: "content.match_voting.manage",
  CONTENT_STATUS_SNAPSHOTS_VIEW: "content.status_snapshots.view",
  CONTENT_STATUS_SNAPSHOTS_MANAGE: "content.status_snapshots.manage",
  CONTENT_FIELD_VIDEOS_VIEW: "content.field_videos.view",
  CONTENT_FIELD_VIDEOS_MANAGE: "content.field_videos.manage",
  CHAT_WRITERS_ACCESS: "chat.writers.access",
  CHAT_MESSAGES_DELETE_ANY: "chat.messages.delete_any",
  SITE_USERS_MANAGE: "site.users.manage",
  SITE_SETTINGS_MANAGE: "site.settings.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

export interface PermissionMeta {
  key: PermissionKey;
  category: string;
  label: string;
}

/** Category + label metadata, in display order -- this is what a future checkbox UI iterates over. */
export const PERMISSION_CATALOG: PermissionMeta[] = [
  { key: PERMISSIONS.ANALYTICS_DASHBOARD_VIEW, category: "Website / Analytics", label: "View Dashboard" },
  { key: PERMISSIONS.ANALYTICS_REALTIME_VIEW, category: "Website / Analytics", label: "View Realtime" },
  { key: PERMISSIONS.ANALYTICS_PAGES_VIEW, category: "Website / Analytics", label: "View Pages" },
  { key: PERMISSIONS.ANALYTICS_SOURCES_VIEW, category: "Website / Analytics", label: "View Sources" },
  { key: PERMISSIONS.ANALYTICS_EVENTS_VIEW, category: "Website / Analytics", label: "View Events" },
  { key: PERMISSIONS.PODCAST_OVERVIEW_VIEW, category: "Podcast", label: "View Podcast Overview" },
  { key: PERMISSIONS.PODCAST_EPISODES_VIEW, category: "Podcast", label: "View Podcast Episodes / Analytics" },
  { key: PERMISSIONS.CONTENT_COLUMNS_VIEW, category: "Content", label: "View Columns" },
  { key: PERMISSIONS.CONTENT_COLUMNS_CREATE, category: "Content", label: "Create Columns" },
  { key: PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN, category: "Content", label: "Edit Own Columns" },
  { key: PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL, category: "Content", label: "Edit All Columns" },
  { key: PERMISSIONS.CONTENT_COLUMNS_PUBLISH, category: "Content", label: "Publish Columns" },
  { key: PERMISSIONS.CONTENT_COLUMNS_SCHEDULE, category: "Content", label: "Schedule Columns" },
  { key: PERMISSIONS.CONTENT_COLUMNS_DELETE, category: "Content", label: "Delete Columns" },
  { key: PERMISSIONS.CONTENT_AUTHORS_MANAGE, category: "Content", label: "Manage Authors" },
  { key: PERMISSIONS.CONTENT_CATEGORIES_MANAGE, category: "Content", label: "Manage Categories" },
  { key: PERMISSIONS.CONTENT_MEDIA_MANAGE, category: "Content", label: "Manage Media" },
  { key: PERMISSIONS.CONTENT_BANNERS_MANAGE, category: "Content", label: "Manage Banners" },
  { key: PERMISSIONS.CONTENT_STAND_MEDIA_VIEW, category: "Content", label: "View Stand Media" },
  { key: PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE, category: "Content", label: "Manage Stand Media" },
  { key: PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_VIEW, category: "Content", label: "View Panel Picks" },
  { key: PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_MANAGE, category: "Content", label: "Manage Panel Picks" },
  { key: PERMISSIONS.CONTENT_MATCH_VOTING_VIEW, category: "Content", label: "View Fan Match Voting" },
  { key: PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE, category: "Content", label: "Manage Fan Match Voting" },
  { key: PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_VIEW, category: "Content", label: "View Status Snapshot" },
  { key: PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE, category: "Content", label: "Manage Status Snapshot" },
  { key: PERMISSIONS.CONTENT_FIELD_VIDEOS_VIEW, category: "Content", label: "View Field Videos" },
  { key: PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE, category: "Content", label: "Manage Field Videos" },
  { key: PERMISSIONS.CHAT_WRITERS_ACCESS, category: "Collaboration", label: "Access Writers Chat" },
  { key: PERMISSIONS.CHAT_MESSAGES_DELETE_ANY, category: "Collaboration", label: "Delete Any Chat Message" },
  { key: PERMISSIONS.SITE_USERS_MANAGE, category: "Administration", label: "Manage Users & Permissions for this site" },
  { key: PERMISSIONS.SITE_SETTINGS_MANAGE, category: "Administration", label: "Manage Site Settings" },
];

/**
 * UI-only convenience for the future New User screen: pre-checks a starting
 * set of permissions when an admin picks a preset, before customizing. Never
 * stored, never consulted by any authorization check -- the database only
 * ever knows about the explicit permission set in `membership_permissions`.
 */
export const ROLE_PRESETS: Record<string, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  editor: [
    PERMISSIONS.ANALYTICS_DASHBOARD_VIEW,
    PERMISSIONS.ANALYTICS_REALTIME_VIEW,
    PERMISSIONS.ANALYTICS_PAGES_VIEW,
    PERMISSIONS.ANALYTICS_SOURCES_VIEW,
    PERMISSIONS.ANALYTICS_EVENTS_VIEW,
    PERMISSIONS.PODCAST_OVERVIEW_VIEW,
    PERMISSIONS.PODCAST_EPISODES_VIEW,
    PERMISSIONS.CONTENT_COLUMNS_VIEW,
    PERMISSIONS.CONTENT_COLUMNS_CREATE,
    PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL,
    PERMISSIONS.CONTENT_COLUMNS_PUBLISH,
    PERMISSIONS.CONTENT_COLUMNS_SCHEDULE,
    PERMISSIONS.CONTENT_COLUMNS_DELETE,
    PERMISSIONS.CONTENT_AUTHORS_MANAGE,
    PERMISSIONS.CONTENT_CATEGORIES_MANAGE,
    PERMISSIONS.CONTENT_MEDIA_MANAGE,
    PERMISSIONS.CONTENT_BANNERS_MANAGE,
    PERMISSIONS.CONTENT_STAND_MEDIA_VIEW,
    PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE,
    PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_VIEW,
    PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_MANAGE,
    PERMISSIONS.CONTENT_MATCH_VOTING_VIEW,
    PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE,
    PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_VIEW,
    PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE,
    PERMISSIONS.CONTENT_FIELD_VIDEOS_VIEW,
    PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE,
    PERMISSIONS.CHAT_WRITERS_ACCESS,
    PERMISSIONS.CHAT_MESSAGES_DELETE_ANY,
  ],
  writer: [
    PERMISSIONS.CONTENT_COLUMNS_VIEW,
    PERMISSIONS.CONTENT_COLUMNS_CREATE,
    PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN,
    PERMISSIONS.CHAT_WRITERS_ACCESS,
  ],
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(value);
}
