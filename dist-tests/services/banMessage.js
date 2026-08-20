const STORAGE_KEY = 'bh.banNotice';
export const BAN_MESSAGE = 'You got banned by an admin. Please contact one of the admins.';
const BAN_TRUE_LITERALS = new Set(['true', 't', '1', 'yes', 'y']);
export const isBannedFlag = (value) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    if (typeof value === 'string') {
        return BAN_TRUE_LITERALS.has(value.trim().toLowerCase());
    }
    return false;
};
export const storeBanMessage = (message = BAN_MESSAGE) => {
    try {
        localStorage.setItem(STORAGE_KEY, message);
    }
    catch (error) {
        console.warn('Unable to persist ban message', error);
    }
};
export const consumeBanMessage = () => {
    try {
        const message = localStorage.getItem(STORAGE_KEY);
        if (message) {
            localStorage.removeItem(STORAGE_KEY);
        }
        return message;
    }
    catch (error) {
        console.warn('Unable to read ban message', error);
        return null;
    }
};
