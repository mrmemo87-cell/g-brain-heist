import { supabase } from './supabaseClient';

export type NotificationType = 
  | 'attack_incoming'      // 🚨 Danger - Someone is attacking you
  | 'attack_defended'      // 🛡️ Victory - You defended successfully
  | 'attack_success'       // ⚔️ Victory - Your attack succeeded
  | 'attack_failed'        // 😢 Loss - Your attack failed
  | 'level_up'            // 🎉 Excitement - You leveled up
  | 'achievement_earned'   // 🏆 Joy - New achievement
  | 'coins_earned'         // 💰 Happiness - Got coins
  | 'coins_lost'           // 😰 Danger - Lost coins
  | 'quest_completed'      // ✅ Success - Quest done
  | 'gemstone_earned'      // 💎 Celebration - Rare gemstone obtained
  | 'low_ap'              // ⚠️ Warning - AP running low
  | 'ap_full'             // ⚡ Ready - AP is full
  | 'challenge_received'   // 🎯 Excitement - Someone challenged you
  | 'clan_invite'         // 👥 Social - Clan invitation
  | 'revenge_available'    // 💢 Opportunity - Get revenge
  | 'streak_danger'       // 🔥 Warning - Streak about to break
  | 'new_rival'           // 👊 Competition - New rival appeared
  | 'leaderboard_change'  // 📊 Progress - Rank changed
  // Teacher-specific notifications
  | 'assignment_completed'  // ✅ Student finished an assignment
  | 'cambridge_test_taken' // 📝 Student took a Cambridge test
  | 'student_improvement'  // 📈 Student showed academic improvement
  | 'new_submission'       // 📬 New work submitted for review
  | 'class_milestone';     // 🎯 Class reached a milestone

export type NotificationAction = {
  label: string;
  view?: 'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher';
  targetUserId?: string; // For revenge attacks
};

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  action?: NotificationAction;
}

class NotificationService {
  private listeners: ((notification: Notification) => void)[] = [];
  private audioContext: AudioContext | null = null;
  
  constructor() {
    this.setupRealtimeSubscription();
  }

  // Setup real-time subscription to notifications
  private setupRealtimeSubscription() {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const notification = payload.new as Notification;
            this.handleNewNotification(notification);
          }
        )
        .subscribe();
    });
  }

  // Handle incoming notification
  private handleNewNotification(notification: Notification) {
    // Play sound based on type
    this.playNotificationSound(notification.type);
    
    // Notify all listeners
    this.listeners.forEach(listener => listener(notification));
  }

  // Play appropriate sound for notification type
  private playNotificationSound(type: NotificationType) {
    const soundMap: Record<NotificationType, string> = {
      attack_incoming: 'alarm',       // Danger!
      attack_defended: 'victory',     // Success!
      attack_success: 'victory',      // Win!
      attack_failed: 'error',         // Loss
      level_up: 'levelup',           // Celebration!
      achievement_earned: 'achievement', // Trophy sound
      coins_earned: 'collect',        // Cha-ching!
      coins_lost: 'error',           // Sad sound
      quest_completed: 'complete',    // Success chime
      gemstone_earned: 'achievement', // Sparkly reward
      low_ap: 'warning',             // Beep
      ap_full: 'ready',              // Ready sound
      challenge_received: 'challenge', // Battle drum
      clan_invite: 'social',         // Friendly ping
      revenge_available: 'revenge',   // Intense sound
      streak_danger: 'warning',      // Alert
      new_rival: 'challenge',        // Battle ready
      leaderboard_change: 'rankup',  // Progress sound
    };

    // Play sound using audio service
    // This would integrate with your existing audioService
    console.log(`🔊 Playing sound: ${soundMap[type]}`);
  }

  // Subscribe to notifications
  subscribe(callback: (notification: Notification) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Create notification
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
    contextData?: Record<string, any>
  ) {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        priority,
        data: contextData,
        read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }

    return data as Notification;
  }

  // Get user notifications
  async getNotifications(limit = 20) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as Notification[];
  }

  // Mark notification as read
  async markAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) throw error;
  }

  // Mark all as read
  async markAllAsRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) throw error;
  }

  // Get unread count
  async getUnreadCount(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) return 0;
    return count || 0;
  }

  // Delete notification
  async deleteNotification(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;
  }

  // Get notification emoji and color based on type
  static getNotificationStyle(type: NotificationType): { emoji: string; color: string; bgColor: string } {
    const styles: Record<NotificationType, { emoji: string; color: string; bgColor: string }> = {
      attack_incoming: { emoji: '🚨', color: 'text-red-400', bgColor: 'bg-red-500/20' },
      attack_defended: { emoji: '🛡️', color: 'text-green-400', bgColor: 'bg-green-500/20' },
      attack_success: { emoji: '⚔️', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
      attack_failed: { emoji: '😢', color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
      level_up: { emoji: '🎉', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
      achievement_earned: { emoji: '🏆', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
      coins_earned: { emoji: '💰', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
      coins_lost: { emoji: '😰', color: 'text-red-400', bgColor: 'bg-red-500/20' },
      quest_completed: { emoji: '✅', color: 'text-green-400', bgColor: 'bg-green-500/20' },
      gemstone_earned: { emoji: '💎', color: 'text-indigo-300', bgColor: 'bg-indigo-500/20' },
      low_ap: { emoji: '⚠️', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
      ap_full: { emoji: '⚡', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
      challenge_received: { emoji: '🎯', color: 'text-pink-400', bgColor: 'bg-pink-500/20' },
      clan_invite: { emoji: '👥', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
      revenge_available: { emoji: '💢', color: 'text-red-400', bgColor: 'bg-red-500/20' },
      streak_danger: { emoji: '🔥', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
      new_rival: { emoji: '👊', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
      leaderboard_change: { emoji: '📊', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
      // Teacher notification styles
      assignment_completed: { emoji: '✅', color: 'text-green-400', bgColor: 'bg-green-500/20' },
      cambridge_test_taken: { emoji: '📝', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
      student_improvement: { emoji: '📈', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
      new_submission: { emoji: '📬', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
      class_milestone: { emoji: '🎯', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    };

    return styles[type];
  }

  // Get default action for notification type
  static getDefaultAction(type: NotificationType): NotificationAction | undefined {
    const actions: Partial<Record<NotificationType, NotificationAction>> = {
      attack_incoming: { label: 'View Battle', view: 'pvp' },
      attack_defended: { label: 'View Battle', view: 'pvp' },
      attack_success: { label: 'View Battle', view: 'pvp' },
      attack_failed: { label: 'View Battle', view: 'pvp' },
      level_up: { label: 'View Profile', view: 'dashboard' },
      achievement_earned: { label: 'View Achievements', view: 'achievements' },
      coins_earned: { label: 'Visit Shop', view: 'shop' },
      coins_lost: { label: 'Earn More', view: 'quest' },
      quest_completed: { label: 'Play Again', view: 'quest' },
      gemstone_earned: { label: 'View Rewards', view: 'quest' },
      low_ap: { label: 'View Profile', view: 'dashboard' },
      ap_full: { label: 'Start Raid', view: 'pvp' },
      challenge_received: { label: 'Accept Challenge', view: 'pvp' },
      clan_invite: { label: 'View Clans', view: 'clan' },
      revenge_available: { label: 'Get Revenge', view: 'pvp' },
      streak_danger: { label: 'Play Now', view: 'quest' },
      new_rival: { label: 'View Leaderboard', view: 'leaderboard' },
      leaderboard_change: { label: 'View Leaderboard', view: 'leaderboard' },
      // Teacher notification actions
      assignment_completed: { label: 'View Reports', view: 'teacher' },
      cambridge_test_taken: { label: 'Review Test', view: 'teacher' },
      student_improvement: { label: 'View Progress', view: 'teacher' },
      new_submission: { label: 'Review', view: 'teacher' },
      class_milestone: { label: 'View Class', view: 'teacher' },
    };

    return actions[type];
  }

  // Types that are ONLY for students (game-related)
  static readonly STUDENT_ONLY_TYPES: NotificationType[] = [
    'attack_incoming', 'attack_defended', 'attack_success', 'attack_failed',
    'coins_earned', 'coins_lost', 'gemstone_earned', 'low_ap', 'ap_full',
    'challenge_received', 'revenge_available', 'streak_danger', 'new_rival',
    'clan_invite',
  ];

  // Types that are ONLY for teachers
  static readonly TEACHER_ONLY_TYPES: NotificationType[] = [
    'assignment_completed', 'cambridge_test_taken', 'student_improvement',
    'new_submission', 'class_milestone',
  ];
}

export const notificationService = new NotificationService();
export { NotificationService }; // Export class for static methods
