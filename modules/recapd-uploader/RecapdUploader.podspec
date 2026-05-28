require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RecapdUploader'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'Proprietary'
  s.author         = 'Zaim Imran'
  s.homepage       = 'https://github.com/zaimimr/Recapd'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "ios/**/*.{h,m,mm,swift,hpp,cpp}"
end
