import ExpoModulesCore
import UIKit

public class RecapdUploaderAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    if identifier == "com.zaimimran.recapd.upload.background" {
      UploadManager.shared.setBackgroundCompletionHandler(completionHandler)
    } else {
      completionHandler()
    }
  }
}
