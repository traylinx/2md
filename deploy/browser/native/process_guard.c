#define _GNU_SOURCE
#include <sys/prctl.h>
#include <unistd.h>
/* Loaded before main in the launcher and parent runtime. No exported API or
 * environment-controlled bypass. Worker exec receives an explicit env without
 * LD_PRELOAD; it never inherits service credentials. */
__attribute__((constructor)) static void protect_process(void) {
    if (prctl(PR_SET_DUMPABLE, 0L, 0L, 0L, 0L) != 0 ||
        prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0) {
        static const char message[] = "browser: process protection unavailable\n";
        (void)write(STDERR_FILENO, message, sizeof(message)-1);
        _exit(78);
    }
}
