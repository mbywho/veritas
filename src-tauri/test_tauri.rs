use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};

fn _test(app_handle: tauri::AppHandle) {
    let monitors = app_handle.available_monitors().unwrap();
    let m = &monitors[0];
    let b = WebviewWindowBuilder::new(&app_handle, "test", WebviewUrl::App("/".into()))
        .position(m.position().x.into(), m.position().y.into())
        .inner_size(m.size().width.into(), m.size().height.into());
}
