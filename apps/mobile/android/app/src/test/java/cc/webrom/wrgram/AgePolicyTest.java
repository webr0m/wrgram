package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.time.LocalDate;
import org.junit.Test;

public class AgePolicyTest {
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 6);
    @Test public void everyEuCountryUkAndAustraliaRequireEighteen() {
        String[] eu = {"AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","GB","AU"};
        for (String code : eu) {
            assertEquals(code, 18, AgePolicy.minimumAge(code));
            assertFalse(code, AgePolicy.eligible(code, TODAY.minusYears(17), TODAY));
            assertTrue(code, AgePolicy.eligible(code, TODAY.minusYears(18), TODAY));
        }
    }
    @Test public void euTerritoriesCannotFallThroughToTeenPolicy() {
        for (String code : new String[]{"AX","GF","GP","MQ","RE","YT","MF"}) assertEquals(code, 18, AgePolicy.minimumAge(code));
    }
    @Test public void bothTeenBandsAndAdultsRemainEligibleInChile() {
        for (int age : new int[]{13,14,15,16,17,18,30}) assertTrue(AgePolicy.eligible("CL", TODAY.minusYears(age), TODAY));
        assertFalse(AgePolicy.eligible("CL", TODAY.minusYears(12), TODAY));
    }
    @Test public void otherCountriesRetainThirteenAsProductFloor() {
        for (String code : new String[]{"US","MX","AR","BR","PE","CA","JP","NZ","NO","CH"}) assertEquals(code, 13, AgePolicy.minimumAge(code));
    }
    @Test public void birthdayIsNotRoundedToBirthYear() {
        assertFalse(AgePolicy.eligible("ES", LocalDate.of(2008,11,7), TODAY));
        assertTrue(AgePolicy.eligible("ES", LocalDate.of(2008,11,6), TODAY));
        assertFalse(AgePolicy.eligible("CL", LocalDate.of(2013,11,7), TODAY));
        assertTrue(AgePolicy.eligible("CL", LocalDate.of(2013,11,6), TODAY));
    }
    @Test public void leapBirthdayUsesConservativeMarchFirst() {
        assertFalse(AgePolicy.eligible("ES", LocalDate.of(2008,2,29), LocalDate.of(2026,2,28)));
        assertTrue(AgePolicy.eligible("ES", LocalDate.of(2008,2,29), LocalDate.of(2026,3,1)));
    }
    @Test public void missingUnknownAndUnnormalizedResidenceNeverDefaults() {
        for (String code : new String[]{"", "ZZ", "es", " ES", "EU", "UK"}) {
            try { AgePolicy.eligible(code, TODAY.minusYears(40), TODAY); fail(code); } catch (IllegalArgumentException expected) { }
        }
        try { AgePolicy.minimumAge(null); fail(); } catch (IllegalArgumentException expected) { }
    }
    @Test public void impossibleOrFutureDatesFailClosed() {
        for (LocalDate birth : new LocalDate[]{null, TODAY.plusDays(1), TODAY.minusYears(121)}) {
            try { AgePolicy.eligible("CL", birth, TODAY); fail(); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void receiptHasBoundedValidityAndDoesNotGrantOnClockRollback() {
        long now = 1_800_000_000_000L;
        AgePolicy.Receipt receipt = new AgePolicy.Receipt("CL", true, now, AgePolicy.REVISION);
        assertTrue(receipt.current(now)); assertTrue(receipt.current(now + AgePolicy.APPROVAL_MS - 1));
        assertFalse(receipt.current(now + AgePolicy.APPROVAL_MS)); assertFalse(receipt.current(now - 1));
    }
    @Test public void oldUnknownAndOverflowedReceiptsCannotGrant() {
        long now = 1_800_000_000_000L;
        assertFalse(new AgePolicy.Receipt("CL", true, now, 0).current(now));
        assertFalse(new AgePolicy.Receipt("ZZ", true, now, AgePolicy.REVISION).current(now));
        assertFalse(new AgePolicy.Receipt("CL", true, Long.MAX_VALUE - 10, AgePolicy.REVISION).current(Long.MAX_VALUE - 1));
    }
    @Test public void denialHasTwentyFourHourRecheckPeriod() {
        long now = 1_800_000_000_000L;
        AgePolicy.Receipt receipt = new AgePolicy.Receipt("ES", false, now, AgePolicy.REVISION);
        assertFalse(receipt.eligible); assertTrue(receipt.current(now + AgePolicy.DENIAL_MS - 1));
        assertFalse(receipt.current(now + AgePolicy.DENIAL_MS));
    }
}
