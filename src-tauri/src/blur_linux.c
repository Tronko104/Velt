#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <wayland-client.h>
#include <X11/Xatom.h>
#include <X11/Xlib.h>

/* -------------------------------------------------------------------------
 * Wayland interface tables for:
 *  1) ext_background_effect_v1 (KDE Plasma 6.7+, standardized Wayland)
 *  2) org_kde_kwin_blur (legacy KDE Plasma fallback)
 * ------------------------------------------------------------------------- */

static const struct wl_interface *empty_types[] = { NULL };
static const struct wl_interface *region_types[] = { &wl_region_interface };
static const struct wl_interface *surface_types[] = { &wl_surface_interface };

static const struct wl_interface ext_background_effect_surface_v1_interface;

static const struct wl_interface *ext_get_effect_types[] = {
    &ext_background_effect_surface_v1_interface,
    &wl_surface_interface,
};

static const struct wl_message ext_mgr_requests[] = {
    { "destroy", "", empty_types },
    { "get_background_effect", "no", ext_get_effect_types },
};

static const struct wl_message ext_mgr_events[] = {
    { "capabilities", "u", empty_types },
};

static const struct wl_interface ext_background_effect_manager_v1_interface = {
    "ext_background_effect_manager_v1",
    1,
    2,
    ext_mgr_requests,
    1,
    ext_mgr_events,
};

static const struct wl_message ext_surf_requests[] = {
    { "destroy", "", empty_types },
    { "set_blur_region", "?o", region_types },
};

static const struct wl_interface ext_background_effect_surface_v1_interface = {
    "ext_background_effect_surface_v1",
    1,
    2,
    ext_surf_requests,
    0,
    NULL,
};

static const struct wl_interface org_kde_kwin_blur_interface;

static const struct wl_interface *kwin_create_types[] = {
    &org_kde_kwin_blur_interface,
    &wl_surface_interface,
};

static const struct wl_message kwin_mgr_requests[] = {
    { "create", "no", kwin_create_types },
    { "unset", "o", surface_types },
};

static const struct wl_interface org_kde_kwin_blur_manager_interface = {
    "org_kde_kwin_blur_manager",
    1,
    2,
    kwin_mgr_requests,
    0,
    NULL,
};

static const struct wl_message kwin_blur_requests[] = {
    { "commit", "", empty_types },
    { "set_region", "?o", region_types },
    { "release", "", empty_types },
};

static const struct wl_interface org_kde_kwin_blur_interface = {
    "org_kde_kwin_blur",
    1,
    3,
    kwin_blur_requests,
    0,
    NULL,
};

typedef struct {
    struct wl_display *display;
    struct wl_compositor *compositor;
    struct wl_proxy *ext_mgr;
    struct wl_proxy *kwin_mgr;
    uint32_t ext_caps;
    bool ext_caps_known;
    struct wl_surface *surface;
    struct wl_proxy *ext_surf;
    struct wl_proxy *kwin_blur;
} VeltWaylandBlurState;

static VeltWaylandBlurState g_wl_state = { 0 };

static void on_ext_capabilities(void *data, struct wl_proxy *proxy, uint32_t capabilities) {
    (void)proxy;
    VeltWaylandBlurState *st = (VeltWaylandBlurState *)data;
    st->ext_caps = capabilities;
    st->ext_caps_known = true;
}

typedef struct {
    void (*capabilities)(void *data, struct wl_proxy *proxy, uint32_t capabilities);
} ExtMgrListener;

static const ExtMgrListener g_ext_mgr_listener = {
    .capabilities = on_ext_capabilities,
};

static void on_registry_global(
    void *data,
    struct wl_registry *registry,
    uint32_t name,
    const char *interface,
    uint32_t version
) {
    VeltWaylandBlurState *st = (VeltWaylandBlurState *)data;

    if (strcmp(interface, "wl_compositor") == 0 && !st->compositor) {
        uint32_t v = version < 4 ? version : 4;
        st->compositor = (struct wl_compositor *)wl_registry_bind(
            registry, name, &wl_compositor_interface, v
        );
    } else if (strcmp(interface, "ext_background_effect_manager_v1") == 0 && !st->ext_mgr) {
        st->ext_mgr = (struct wl_proxy *)wl_registry_bind(
            registry, name, &ext_background_effect_manager_v1_interface, 1
        );
    } else if (strcmp(interface, "org_kde_kwin_blur_manager") == 0 && !st->kwin_mgr) {
        st->kwin_mgr = (struct wl_proxy *)wl_registry_bind(
            registry, name, &org_kde_kwin_blur_manager_interface, 1
        );
    }
}

static void on_registry_remove(void *data, struct wl_registry *registry, uint32_t name) {
    (void)data;
    (void)registry;
    (void)name;
}

static const struct wl_registry_listener g_registry_listener = {
    .global = on_registry_global,
    .global_remove = on_registry_remove,
};

static void ensure_wayland_globals(struct wl_display *display) {
    if (g_wl_state.display == display &&
        g_wl_state.compositor &&
        (g_wl_state.ext_mgr || g_wl_state.kwin_mgr)) {
        return;
    }

    if (g_wl_state.display != display) {
        memset(&g_wl_state, 0, sizeof(g_wl_state));
        g_wl_state.display = display;
    }

    struct wl_event_queue *queue = wl_display_create_queue(display);
    if (!queue) return;

    struct wl_display *wrapped = (struct wl_display *)wl_proxy_create_wrapper(display);
    if (!wrapped) {
        wl_event_queue_destroy(queue);
        return;
    }
    wl_proxy_set_queue((struct wl_proxy *)wrapped, queue);

    struct wl_registry *registry = wl_display_get_registry(wrapped);
    if (registry) {
        wl_registry_add_listener(registry, &g_registry_listener, &g_wl_state);
        wl_display_roundtrip_queue(display, queue);

        if (g_wl_state.ext_mgr) {
            wl_proxy_add_listener(
                g_wl_state.ext_mgr,
                (void (**)(void))&g_ext_mgr_listener,
                &g_wl_state
            );
            wl_display_roundtrip_queue(display, queue);
            wl_proxy_set_queue(g_wl_state.ext_mgr, NULL);
        }
        if (g_wl_state.compositor) {
            wl_proxy_set_queue((struct wl_proxy *)g_wl_state.compositor, NULL);
        }
        if (g_wl_state.kwin_mgr) {
            wl_proxy_set_queue(g_wl_state.kwin_mgr, NULL);
        }
        wl_registry_destroy(registry);
    }

    wl_proxy_wrapper_destroy(wrapped);
    wl_event_queue_destroy(queue);
}

int velt_apply_wayland_blur(void *wl_display_ptr, void *wl_surface_ptr, bool enabled) {
    if (!wl_display_ptr || !wl_surface_ptr) {
        return -1;
    }

    struct wl_display *display = (struct wl_display *)wl_display_ptr;
    struct wl_surface *surface = (struct wl_surface *)wl_surface_ptr;

    ensure_wayland_globals(display);

    if (!g_wl_state.compositor) {
        return -2;
    }

    if (g_wl_state.surface != surface) {
        if (g_wl_state.ext_surf) {
            wl_proxy_marshal_flags(
                g_wl_state.ext_surf,
                0, /* destroy */
                NULL,
                wl_proxy_get_version(g_wl_state.ext_surf),
                WL_MARSHAL_FLAG_DESTROY
            );
            g_wl_state.ext_surf = NULL;
        }
        if (g_wl_state.kwin_blur) {
            wl_proxy_marshal_flags(
                g_wl_state.kwin_blur,
                2, /* release */
                NULL,
                wl_proxy_get_version(g_wl_state.kwin_blur),
                WL_MARSHAL_FLAG_DESTROY
            );
            g_wl_state.kwin_blur = NULL;
        }
        g_wl_state.surface = surface;
    }

    if (g_wl_state.ext_mgr && (!g_wl_state.ext_caps_known || (g_wl_state.ext_caps & 1u) != 0)) {
        if (!g_wl_state.ext_surf && enabled) {
            g_wl_state.ext_surf = wl_proxy_marshal_flags(
                g_wl_state.ext_mgr,
                1, /* get_background_effect */
                &ext_background_effect_surface_v1_interface,
                wl_proxy_get_version(g_wl_state.ext_mgr),
                0,
                NULL,
                surface
            );
        }

        if (g_wl_state.ext_surf) {
            if (enabled) {
                struct wl_region *region = wl_compositor_create_region(g_wl_state.compositor);
                if (region) {
                    wl_region_add(region, 0, 0, 16384, 16384);
                    wl_proxy_marshal_flags(
                        g_wl_state.ext_surf,
                        1, /* set_blur_region */
                        NULL,
                        wl_proxy_get_version(g_wl_state.ext_surf),
                        0,
                        region
                    );
                    wl_region_destroy(region);
                }
            } else {
                wl_proxy_marshal_flags(
                    g_wl_state.ext_surf,
                    1, /* set_blur_region(NULL) */
                    NULL,
                    wl_proxy_get_version(g_wl_state.ext_surf),
                    0,
                    NULL
                );
            }
            wl_surface_commit(surface);
            wl_display_flush(display);
            return 0;
        }
    }

    if (g_wl_state.kwin_mgr) {
        if (enabled) {
            if (!g_wl_state.kwin_blur) {
                g_wl_state.kwin_blur = wl_proxy_marshal_flags(
                    g_wl_state.kwin_mgr,
                    0, /* create */
                    &org_kde_kwin_blur_interface,
                    wl_proxy_get_version(g_wl_state.kwin_mgr),
                    0,
                    NULL,
                    surface
                );
            }
            if (g_wl_state.kwin_blur) {
                struct wl_region *region = wl_compositor_create_region(g_wl_state.compositor);
                if (region) {
                    wl_region_add(region, 0, 0, 16384, 16384);
                    wl_proxy_marshal_flags(
                        g_wl_state.kwin_blur,
                        1, /* set_region */
                        NULL,
                        wl_proxy_get_version(g_wl_state.kwin_blur),
                        0,
                        region
                    );
                    wl_region_destroy(region);
                }
                wl_proxy_marshal_flags(
                    g_wl_state.kwin_blur,
                    0, /* commit */
                    NULL,
                    wl_proxy_get_version(g_wl_state.kwin_blur),
                    0
                );
                wl_surface_commit(surface);
                wl_display_flush(display);
                return 0;
            }
        } else {
            wl_proxy_marshal_flags(
                g_wl_state.kwin_mgr,
                1, /* unset */
                NULL,
                wl_proxy_get_version(g_wl_state.kwin_mgr),
                0,
                surface
            );
            if (g_wl_state.kwin_blur) {
                wl_proxy_marshal_flags(
                    g_wl_state.kwin_blur,
                    2, /* release */
                    NULL,
                    wl_proxy_get_version(g_wl_state.kwin_blur),
                    WL_MARSHAL_FLAG_DESTROY
                );
                g_wl_state.kwin_blur = NULL;
            }
            wl_surface_commit(surface);
            wl_display_flush(display);
            return 0;
        }
    }

    return -3;
}

int velt_apply_x11_blur(void *x_display_ptr, unsigned long x_window, bool enabled) {
    if (!x_display_ptr || x_window == 0) {
        return -1;
    }

    Display *dpy = (Display *)x_display_ptr;
    Atom prop = XInternAtom(dpy, "_KDE_NET_WM_BLUR_BEHIND_REGION", False);
    if (prop == None) {
        return -2;
    }

    if (enabled) {
        unsigned long empty = 0;
        XChangeProperty(
            dpy,
            (Window)x_window,
            prop,
            XA_CARDINAL,
            32,
            PropModeReplace,
            (const unsigned char *)&empty,
            0
        );
    } else {
        XDeleteProperty(dpy, (Window)x_window, prop);
    }

    XFlush(dpy);
    return 0;
}
