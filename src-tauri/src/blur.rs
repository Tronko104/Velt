use std::ffi::{c_int, c_ulong, c_void};
use tauri::WebviewWindow;

#[cfg(target_os = "linux")]
extern "C" {
    fn velt_apply_wayland_blur(
        wl_display_ptr: *mut c_void,
        wl_surface_ptr: *mut c_void,
        enabled: bool,
    ) -> c_int;

    fn velt_apply_x11_blur(
        x_display_ptr: *mut c_void,
        x_window: c_ulong,
        enabled: bool,
    ) -> c_int;
}

/// Requests OS compositor background blur (Wayland `ext_background_effect_v1` /
/// legacy `org_kde_kwin_blur`, or X11 `_KDE_NET_WM_BLUR_BEHIND_REGION`).
#[cfg(target_os = "linux")]
pub fn apply_window_blur(window: &WebviewWindow, enabled: bool) {
    use raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle};

    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let Ok(dpy_handle) = win.display_handle() else {
            return;
        };
        let Ok(win_handle) = win.window_handle() else {
            return;
        };

        match (dpy_handle.as_raw(), win_handle.as_raw()) {
            (RawDisplayHandle::Wayland(d), RawWindowHandle::Wayland(w)) => unsafe {
                let _ = velt_apply_wayland_blur(d.display.as_ptr(), w.surface.as_ptr(), enabled);
            },
            (RawDisplayHandle::Xlib(d), RawWindowHandle::Xlib(w)) => {
                if let Some(display_ptr) = d.display {
                    unsafe {
                        let _ = velt_apply_x11_blur(
                            display_ptr.as_ptr(),
                            w.window as c_ulong,
                            enabled,
                        );
                    }
                }
            }
            _ => {}
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn apply_window_blur(_window: &WebviewWindow, _enabled: bool) {}
