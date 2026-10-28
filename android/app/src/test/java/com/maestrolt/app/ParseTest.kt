package com.maestrolt.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class ParseTest {
    private val riyadh = TimeZone.getTimeZone("Asia/Riyadh")

    @Test fun phoneTitles() {
        assertEquals("+966501234567", Parse.phoneFromTitle("+966 50 123 4567"))
        assertEquals("+966501234567", Parse.phoneFromTitle("‪+966 50 123 4567‬"))
        assertEquals("0501234567", Parse.phoneFromTitle("٠٥٠١٢٣٤٥٦٧"))
        assertNull(Parse.phoneFromTitle("أبو خالد"))
        assertNull(Parse.phoneFromTitle("Ahmed"))
        assertNull(Parse.phoneFromTitle("عائلة 2026"))
        assertNull(Parse.phoneFromTitle(null))
    }

    @Test fun messageTypes() {
        assertEquals("image", Parse.waType("📷 Photo"))
        assertEquals("voice", Parse.waType("🎤 Voice message (0:12)"))
        assertEquals("location", Parse.waType("📍 Location"))
        assertEquals("text", Parse.waType("بكام الباقة؟"))
    }

    @Test fun summaries() {
        assertTrue(Parse.isSummaryText("5 new messages"))
        assertTrue(Parse.isSummaryText("٣ رسائل جديدة"))
        assertFalse(Parse.isSummaryText("السلام عليكم"))
    }

    @Test fun clockTimes() {
        val now = Calendar.getInstance(riyadh).apply { set(2026, 9, 28, 18, 30, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
        val t1 = Parse.clockToMillis("3:45 PM", now, riyadh)!!
        assertEquals(15, Calendar.getInstance(riyadh).apply { timeInMillis = t1 }.get(Calendar.HOUR_OF_DAY))
        val t2 = Parse.clockToMillis("٦:١٠ م", now, riyadh)!!
        assertEquals(18, Calendar.getInstance(riyadh).apply { timeInMillis = t2 }.get(Calendar.HOUR_OF_DAY))
        // وقت بعد دلوقتي = امبارح
        val t3 = Parse.clockToMillis("23:10", now, riyadh)!!
        assertEquals(27, Calendar.getInstance(riyadh).apply { timeInMillis = t3 }.get(Calendar.DAY_OF_MONTH))
        assertNull(Parse.clockToMillis("أمس", now, riyadh))
    }

    @Test fun callKinds() {
        assertEquals("in" to "answered", Parse.callKind(1, 40))
        assertEquals("in" to "missed", Parse.callKind(3, 0))
        assertEquals("out" to "missed", Parse.callKind(2, 0))
        assertEquals("in" to "rejected", Parse.callKind(5, 0))
        assertNull(Parse.callKind(4, 0))
    }

    @Test fun isoFormat() {
        assertEquals("1970-01-01T00:00:01.000Z", Parse.iso(1000))
    }
}
