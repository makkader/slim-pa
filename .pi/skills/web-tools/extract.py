from seleniumwire import webdriver  
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import sys


def extract_content(url):
    
    options = Options()
    options.add_argument("--headless")
    options.binary_location = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"  
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-extensions")
    options.add_argument("--start-maximized")

    service=Service(ChromeDriverManager().install())


    try:
        driver = webdriver.Chrome(service=service, options=options)
        driver.get(url)

        page_html = driver.page_source
        print("\n=== PAGE HTML ===\n")
        print(page_html)
        page_text = driver.find_element("tag name", "body").text

        print(page_text)
        
    finally:
        print("Quitting browser...")
        driver.quit()

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.google.com/search?q=mak+kader"
    extract_content(url)