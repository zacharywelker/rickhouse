import Foundation

enum SpiritChoices {
    static let ginStyles = ["London Dry", "Old Tom", "Contemporary", "Plymouth", "Holland-Style", "Other"]
    static let ginBases = ["Corn", "Potato", "Rye", "Grape", "Molasses", "Sugarcane", "Apple", "Wheat", "Barley", "Whey"]
    static let ginBotanicals = ["Juniper", "Coriander", "Angelica Root", "Cassia Bark", "Lemon", "Bitter Orange", "Lime", "Yuzu", "Grapefruit", "Pomelo", "Cardamom", "Cucumber", "Lavender", "Allspice", "Almond", "Bergamot", "Anise", "Basil", "Bay Laurel", "Black Pepper", "Blood Orange", "Butterfly Pea Flower", "Hibiscus", "Chamomile", "Cloves", "Cubeb Pepper", "Dill", "Elderflower", "Elderberry", "Fennel", "Ginger", "Grains of Paradise", "Honeysuckle", "Lemongrass", "Licorice", "Meadowsweet", "Nutmeg", "Orris Root", "Rosemary", "Rose", "Thyme"]
    static func ageText(years: String?, months: Int?, days: Int?, statement: String?) -> String? {
        var parts: [String] = []
        if let years, let number = Double(years), number != 0 { parts.append("\(number.formatted())y") }
        if let months, months != 0 { parts.append("\(months)m") }
        if let days, days != 0 { parts.append("\(days)d") }
        return parts.isEmpty ? statement : parts.joined(separator: " ")
    }
    static let tequila: [(value: String, title: String)] = [
        ("blanco", "Blanco"), ("joven", "Joven"), ("reposado", "Reposado"),
        ("anejo", "Añejo"), ("extra-anejo", "Extra Añejo"), ("cristalino", "Cristalino"),
    ]
    static let tequilaGuidance: [String: String] = [
        "blanco": "0–2 months", "reposado": "2 months–1 year",
        "anejo": "1–3 years", "extra-anejo": "3+ years",
    ]
    static let brandyGrades = ["VS", "VSOP", "XO"]
    static let brandyMinimum: [String: [String: Int]] = [
        "cognac": ["VS": 2, "VSOP": 4, "XO": 10],
        "armagnac": ["VS": 1, "VSOP": 4, "XO": 10],
        "calvados": ["VS": 2, "VSOP": 4, "XO": 6],
    ]
}
