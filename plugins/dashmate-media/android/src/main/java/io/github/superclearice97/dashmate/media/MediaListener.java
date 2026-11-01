package io.github.superclearice97.dashmate.media;

import android.service.notification.NotificationListenerService;

/**
 * Exists only so the user can grant DashMate access to the phone's media sessions
 * (Android ties that permission to a notification listener). It deliberately does
 * not override onNotificationPosted: DashMate never reads your notifications.
 */
public class MediaListener extends NotificationListenerService {}
