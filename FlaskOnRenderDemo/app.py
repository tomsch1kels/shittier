from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/find', methods=['POST'])
def find_file_size():
    # 1. Ensure the request has a file attached
    if 'image' not in request.files:
        return jsonify({"error": "No file provided. Please send a file with the key 'image'."}), 400
    
    file = request.files['image']
    
    # 2. Ensure the file isn't empty
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # 3. Calculate file size 
    file.seek(0, 2)
    file_size_bytes = file.tell()
    file.seek(0)
    
    # 4. Fetch data from yesno.wtf
    yesno_result = {}
    try:
        # A short timeout prevents your app from hanging if their API is down
        response = requests.get('https://yesno.wtf/api', timeout=5)
        response.raise_for_status()
        yesno_result = response.json()
    except requests.RequestException as e:
        # Gracefully handle the case where the external API fails
        yesno_result = {"error": f"Could not reach yesno.wtf: {str(e)}"}

    return jsonify({
        "message": "File received successfully",
        "filename": file.filename,
        "file_size_bytes": file_size_bytes,
        "yesno": yesno_result
    }), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)