import ReactDOM from 'react-dom';
import App from './App';
import './styles/webchat.css';
import './styles/app.css';

// React 17 renders through ReactDOM.render (the createRoot API was introduced in React 18).
ReactDOM.render(<App />, document.getElementById('webchat'));
