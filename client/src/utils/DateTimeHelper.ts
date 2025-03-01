class DateTimeHelper {
    /**
     * Converts a UTC timestamp (from Supabase or other sources) into the user's local time
     * @param utcTimestamp - The timestamp from the database (should be in ISO 8601 format with Z)
     * @returns Local time in 'hh:mm AM/PM' format
     */
    static formatLocalTime(utcTimestamp: string): string {
        const date = new Date(utcTimestamp);

        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true // Optional if you want 12-hour format
        });
    }

    /**
     * Converts a UTC timestamp into a full localized date + time string
     * @param utcTimestamp - The timestamp from the database
     * @returns Local date and time in 'Mar 1, 2025, 11:18 AM' format
     */
    static formatLocalDateTime(utcTimestamp: string): string {
        const date = new Date(utcTimestamp);

        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    /**
     * Converts UTC timestamp into user's local date (without time)
     * @param utcTimestamp - The timestamp from the database
     * @returns Local date in 'Mar 1, 2025' format
     */
    static formatLocalDate(utcTimestamp: string): string {
        const date = new Date(utcTimestamp);

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        });
    }
}

export default DateTimeHelper;
