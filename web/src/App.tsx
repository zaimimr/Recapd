import "./App.css";

function App() {
  const appStoreUrl = "https://apps.apple.com/app/recapd/id6745136939";

  return (
    <div className="container">
      <h1>Recapd</h1>
      <p className="tagline">Share photos together, privately.</p>
      <a href={appStoreUrl} className="btn">
        Download on the App Store
      </a>
    </div>
  );
}

export default App;
