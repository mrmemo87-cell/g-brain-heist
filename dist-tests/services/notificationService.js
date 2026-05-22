import { supabase } from './supabaseClient.js';
import { audioService } from './audioService.js';
class NotificationService {
    constructor() {
        this.listeners = [];
        this.setupRealtimeSubscription();
    }
    // Setup real-time subscription to notifications
    setupRealtimeSubscription() {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user)
                return;
            supabase
                .channel('notifications')
                .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`,
            }, (payload) => {
                const notification = payload.new;
                this.handleNewNotification(notification);
            })
                .subscribe();
        });
    }
    // Handle incoming notification
    handleNewNotification(notification) {
        // Play sound based on type
        this.playNotificationSound(notification.type);
        // Notify all listeners
        this.listeners.forEach(listener => listener(notification));
    }
    // Play appropriate sound for notification type
    playNotificationSound(type) {
        // Map notification types to sound effects
        const soundMap = {
            attack_incoming: 'hack_fail', // Alert!
            attack_defended: 'tada', // Success!
            attack_success: 'tada', // Win!
            attack_failed: 'wrong', // Loss
            level_up: 'level_up', // Celebration!
            achievement_earned: 'achievement', // Trophy sound! 🏆
            coins_earned: 'collect', // Cha-ching!
            coins_lost: 'wrong', // Sad sound
            quest_completed: 'tada', // Success chime
            gemstone_earned: 'achievement', // Sparkly reward
            low_ap: 'notification', // Beep
            ap_full: 'notification', // Ready sound
            challenge_received: 'notification', // Battle drum
            clan_invite: 'notification', // Friendly ping
            revenge_available: 'notification', // Intense sound
            streak_danger: 'wrong', // Alert
            new_rival: 'notification', // Battle ready
            leaderboard_change: 'tada', // Progress sound
            assignment_completed: 'correct', // Teacher notification
            cambridge_test_taken: 'notification',
            student_improvement: 'tada',
            new_submission: 'notification',
            class_milestone: 'tada',
        };
        const sound = soundMap[type];
        if (sound) {
            audioService.play(sound);
        }
    }
    // Subscribe to notifications
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }
    // Create notification
    async createNotification(userId, type, title, message, priority = 'medium', contextData) {
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
        return data;
    }
    // Get user notifications
    async getNotifications(limit = 20) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            throw new Error('Not authenticated');
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return data;
    }
    // Mark notification as read
    async markAsRead(notificationId) {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);
        if (error)
            throw error;
    }
    // Mark all as read
    async markAllAsRead() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            throw new Error('Not authenticated');
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', user.id)
            .eq('read', false);
        if (error)
            throw error;
    }
    // Get unread count
    async getUnreadCount() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return 0;
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);
        if (error)
            return 0;
        return count || 0;
    }
    // Delete notification
    async deleteNotification(notificationId) {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId);
        if (error)
            throw error;
    }
    // Get notification emoji and color based on type
    static getNotificationStyle(type) {
        const styles = {
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
    static getDefaultAction(type) {
        const actions = {
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
    static { this.STUDENT_ONLY_TYPES = [
        'attack_incoming', 'attack_defended', 'attack_success', 'attack_failed',
        'coins_earned', 'coins_lost', 'gemstone_earned', 'low_ap', 'ap_full',
        'challenge_received', 'revenge_available', 'streak_danger', 'new_rival',
        'clan_invite',
    ]; }
    // Types that are ONLY for teachers
    static { this.TEACHER_ONLY_TYPES = [
        'assignment_completed', 'cambridge_test_taken', 'student_improvement',
        'new_submission', 'class_milestone',
    ]; }
}
export const notificationService = new NotificationService();
export { NotificationService }; // Export class for static methods
export const notifyTeachersOfExamGuard = async ({ studentId, studentName, studentClass, schoolId, testName, violationCount, type, priority = 'urgent', extraData, }) => {
    if (!schoolId) {
        return;
    }
    const { data: teachers, error } = await supabase
        .from('users')
        .select('id')
        .eq('school_id', schoolId)
        .eq('role', 'teacher');
    if (error) {
        throw error;
    }
    if (!teachers || teachers.length === 0) {
        return;
    }
    await Promise.allSettled(teachers.map((teacher) => notificationService.createNotification(teacher.id, type, 'ExamGuard auto-submission', `${studentName} reached the maximum violation limit on ${testName}. The submission was auto-submitted for review.`, priority, {
        studentId,
        studentName,
        studentClass,
        testName,
        violationCount,
        autoSubmitted: true,
        ...extraData,
    })));
};
