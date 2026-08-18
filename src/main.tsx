import ReactDOM from 'react-dom';
import App from './App';
import './styles/webchat.css';
import './styles/app.css';

// React 17 render API (matches the react-dom@17 peer used across the internal SPA).
ReactDOM.render(<App />, document.getElementById('webchat'));
