import React, { useState, useEffect } from 'react';
import { notificationService, Notification, NotificationService } from '../services/notificationService';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    
    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribe((notification) => {
      setNotifications(prev => [notification, ...prev]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationService.getNotifications(20);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const getTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Notification Panel */}
      <div className="fixed top-16 right-4 w-96 max-h-[600px] bg-gray-900 border-2 border-purple-500/30 rounded-lg shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-purple-500/20">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔔</span>
            <h2 className="text-lg font-bold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-1 text-xs font-bold bg-red-500 text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="flex gap-2 p-3 border-b border-purple-500/20">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
        )}

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin text-2xl">⚡</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <span className="text-4xl mb-2">🔕</span>
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-purple-500/10">
              {notifications.map((notification) => {
                const style = NotificationService.getNotificationStyle(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-800/50 transition-colors cursor-pointer ${
                      !notification.read ? 'bg-purple-900/20' : ''
                    }`}
                    onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{style.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`font-semibold text-sm ${style.color}`}>
                            {notification.title}
                          </h3>
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {getTimeAgo(notification.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        {notification.priority === 'urgent' && (
                          <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded">
                            URGENT
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notification.id);
                        }}
                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Delete notification"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
