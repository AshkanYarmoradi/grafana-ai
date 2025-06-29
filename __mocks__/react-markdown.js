// Mock implementation of react-markdown
const React = require('react');

function ReactMarkdown({children}) {
    return React.createElement('div', {className: 'react-markdown'}, children);
}

module.exports = ReactMarkdown;