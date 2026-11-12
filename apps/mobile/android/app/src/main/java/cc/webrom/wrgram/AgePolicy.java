package cc.webrom.wrgram;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Product eligibility, not identity verification or an exhaustive survey of local law. */
final class AgePolicy {
    static final int REVISION = 1;
    static final long APPROVAL_MS = 30L * 24 * 60 * 60 * 1000;
    static final long DENIAL_MS = 24L * 60 * 60 * 1000;
    static final Set<String> COUNTRIES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(Locale.getISOCountries())));
    // EU27 + UK + Australia; ISO-listed EU outermost territories / Aland included.
    // telegram.org/tos, checked 2026-11-06. Review this versioned rule when terms change.
    static final Set<String> ADULT_REGIONS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
        "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "AU",
        "AX", "GF", "GP", "MQ", "RE", "YT", "MF")));

    static int minimumAge(String country) {
        if (!COUNTRIES.contains(country)) throw new IllegalArgumentException("Residence required");
        return ADULT_REGIONS.contains(country) ? 18 : 13;
    }
    static boolean eligible(String country, LocalDate birth, LocalDate today) {
        int minimum = minimumAge(country);
        if (birth == null || today == null || birth.isAfter(today) || birth.isBefore(today.minusYears(120)))
            throw new IllegalArgumentException("Invalid date");
        LocalDate anniversary;
        try { anniversary = LocalDate.of(birth.getYear() + minimum, birth.getMonthValue(), birth.getDayOfMonth()); }
        catch (DateTimeException ignored) { anniversary = LocalDate.of(birth.getYear() + minimum, 3, 1); }
        return !today.isBefore(anniversary);
    }
    static final class Receipt {
        final String country;
        final boolean eligible;
        final long checkedAt;
        final int revision;
        Receipt(String country, boolean eligible, long checkedAt, int revision) {
            this.country = country; this.eligible = eligible; this.checkedAt = checkedAt; this.revision = revision;
        }
        long expiresAt() { return checkedAt + (eligible ? APPROVAL_MS : DENIAL_MS); }
        boolean current(long now) {
            return revision == REVISION && COUNTRIES.contains(country) && checkedAt > 0 && now >= checkedAt &&
                checkedAt <= Long.MAX_VALUE - APPROVAL_MS && now < expiresAt();
        }
    }
}
